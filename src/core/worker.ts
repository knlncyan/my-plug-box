/**
 * 插件命令 Worker 入口：
 * 1) 运行在 Worker 环境，隔离插件命令执行上下文。
 * 2) 通过消息协议向宿主请求能力（跨插件命令、视图激活、设置/存储持久化等）。
 */
import type { PluginHostAPI } from '../domain/api';
import type { CapabilityContract } from '../domain/capability';
import type {
    HostEventMessage,
    HostRequestMessage,
    HostResponseMessage,
    PendingRequest,
    WorkerRequestMessage,
    WorkerResponseMessage,
} from '../domain/worker';
import type {
    BuiltinPluginModule,
    CommandExecutionContext,
} from '../domain/protocol/plugin-runtime.protocol';

const pluginModules = import.meta.glob('../plugins/*/index.ts');

let pluginId = '';
let pluginModule: BuiltinPluginModule | null = null;
let activated = false;
let settingsSnapshot: Record<string, unknown> = {};
let storageSnapshot: Record<string, unknown> = {};
let activeTrace: string[] = [];

const pendingRequests = new Map<string, PendingRequest>();
const capabilityProxyById = new Map<string, CapabilityContract>();
const eventListeners = new Map<string, Set<(payload: unknown) => void>>();
const settingWatchers = new Map<string, Set<(value: unknown) => void>>();
let requestSerial = 0;

function resolvePluginModuleKey(id: string): string {
    const folder = id.replace(/^builtin\./, '');
    return `../plugins/${folder}/index.ts`;
}

async function ensurePluginModule(): Promise<BuiltinPluginModule> {
    if (pluginModule) return pluginModule;
    if (!pluginId) {
        throw new Error('Worker not initialized: missing pluginId');
    }

    const moduleKey = resolvePluginModuleKey(pluginId);
    const loader = pluginModules[moduleKey] as
        | (() => Promise<{ default?: BuiltinPluginModule }>)
        | undefined;

    if (!loader) {
        throw new Error(`Plugin module not found: ${moduleKey}`);
    }

    const loaded = await loader();
    if (!loaded.default) {
        throw new Error(`Plugin module default export missing: ${moduleKey}`);
    }
    pluginModule = loaded.default;
    return pluginModule;
}

function postHostResponse(requestId: string, result?: unknown, error?: string): void {
    const message: HostResponseMessage = {
        type: 'host-response',
        requestId,
        result,
        error,
    };
    self.postMessage(message);
}

/**
 * 向宿主发起通用能力调用。
 * - `method` 采用能力命名空间（如 `command.execute`）。
 * - `params` 为对应能力的参数对象。
 */
function callHost(method: string, params?: unknown): Promise<unknown> {
    requestSerial += 1;
    const requestId = `${pluginId || 'plugin'}:${requestSerial}`;
    const message: WorkerRequestMessage = {
        type: 'worker-request',
        requestId,
        method,
        params,
    };

    return new Promise((resolve, reject) => {
        pendingRequests.set(requestId, { resolve, reject });
        self.postMessage(message);
    });
}

function notifySettingWatchers(key: string, value: unknown): void {
    const watchers = settingWatchers.get(key);
    if (!watchers) return;
    for (const watcher of watchers) {
        try {
            watcher(value);
        } catch (error) {
            console.error(`[plugin-worker] settings.onChange callback failed: ${key}`, error);
        }
    }
}

const hostApi: PluginHostAPI = {
    get pluginId() {
        return pluginId;
    },
    capabilities: {
        call: async <T = unknown>(method: string, params?: unknown): Promise<T> => {
            return (await callHost(method, params)) as T;
        },
        get: <K extends string, T extends CapabilityContract>(capabilityId: K): T => {
            const existing = capabilityProxyById.get(capabilityId);
            if (existing) {
                return existing as T;
            }

            // 通过 Proxy 将方法调用转发到宿主通用能力分发器。
            const proxy = new Proxy(
                {},
                {
                    get: (_target, methodName) => {
                        if (typeof methodName !== 'string') return undefined;
                        return (...args: unknown[]) =>
                            callHost('capability.invoke', {
                                capabilityId,
                                method: methodName,
                                args,
                            });
                    },
                }
            ) as CapabilityContract;

            capabilityProxyById.set(capabilityId, proxy);
            return proxy as T;
        },
    },
    commands: {
        execute: async (commandId: string, ...args: unknown[]) => {
            return callHost('command.execute', {
                commandId,
                args,
                trace: activeTrace,
            });
        },
    },
    views: {
        activate: (viewId: string) => {
            void callHost('view.activate', { viewId });
        },
    },
    events: {
        emit: (event: string, payload?: unknown) => {
            void callHost('event.emit', { event, payload });
        },
        on: (event: string, handler: (payload: unknown) => void) => {
            let listeners = eventListeners.get(event);
            if (!listeners) {
                listeners = new Set();
                eventListeners.set(event, listeners);
            }
            listeners.add(handler);
            return {
                dispose: () => {
                    listeners?.delete(handler);
                    if (listeners && listeners.size === 0) {
                        eventListeners.delete(event);
                    }
                },
            };
        },
    },
    settings: {
        get: async <T>(key: string): Promise<T | undefined> => {
            const scopedKey = `${pluginId}.${key}`;
            return settingsSnapshot[scopedKey] as T | undefined;
        },
        set: async (key: string, value: unknown): Promise<void> => {
            const scopedKey = `${pluginId}.${key}`;
            settingsSnapshot[scopedKey] = value;
            notifySettingWatchers(key, value);
            await callHost('settings.set', { key, value });
        },
        onChange: <T>(key: string, handler: (value: T | undefined) => void) => {
            let watchers = settingWatchers.get(key);
            if (!watchers) {
                watchers = new Set();
                settingWatchers.set(key, watchers);
            }
            const wrapped = (value: unknown) => handler(value as T | undefined);
            watchers.add(wrapped);
            return {
                dispose: () => {
                    watchers?.delete(wrapped);
                    if (watchers && watchers.size === 0) {
                        settingWatchers.delete(key);
                    }
                },
            };
        },
    },
    storage: {
        get: async <T>(key: string): Promise<T | undefined> => {
            return storageSnapshot[key] as T | undefined;
        },
        set: async (key: string, value: unknown): Promise<void> => {
            storageSnapshot[key] = value;
            await callHost('storage.set', { key, value });
        },
    },
};

async function executeCommand(
    commandId: string,
    args: unknown[],
    trace: string[]
): Promise<unknown> {
    const module = await ensurePluginModule();
    const handler = module.commands?.[commandId];
    if (!handler) {
        throw new Error(`Command handler not found in plugin "${pluginId}": ${commandId}`);
    }

    const previousTrace = activeTrace;
    activeTrace = trace;
    try {
        const context: CommandExecutionContext = {
            activateView: (viewId: string) => hostApi.views.activate(viewId),
            executeCommand: (targetCommandId: string, ...nestedArgs: unknown[]) =>
                hostApi.commands.execute(targetCommandId, ...nestedArgs),
            api: hostApi,
        };
        return await handler(context, ...args);
    } finally {
        activeTrace = previousTrace;
    }
}

async function activatePlugin(): Promise<void> {
    if (activated) return;
    const module = await ensurePluginModule();
    await module.activate?.(hostApi);
    activated = true;
}

async function deactivatePlugin(): Promise<void> {
    if (!activated) return;
    const module = await ensurePluginModule();
    await module.deactivate?.(hostApi);
    activated = false;
}

function handleWorkerResponse(msg: WorkerResponseMessage): void {
    const pending = pendingRequests.get(msg.requestId);
    if (!pending) return;

    pendingRequests.delete(msg.requestId);
    if (msg.error) {
        pending.reject(new Error(msg.error));
    } else {
        pending.resolve(msg.result);
    }
}

function handleHostEvent(msg: HostEventMessage): void {
    if (msg.event === 'setting.changed' && msg.payload && typeof msg.payload === 'object') {
        const data = msg.payload as { key?: unknown; value?: unknown };
        if (typeof data.key === 'string') {
            const scopedKey = `${pluginId}.${data.key}`;
            settingsSnapshot[scopedKey] = data.value;
            notifySettingWatchers(data.key, data.value);
        }
    }

    const listeners = eventListeners.get(msg.event);
    if (!listeners) return;
    for (const listener of listeners) {
        try {
            listener(msg.payload);
        } catch (error) {
            console.error(`[plugin-worker] event listener failed: ${msg.event}`, error);
        }
    }
}

async function handleHostRequest(msg: HostRequestMessage): Promise<void> {
    try {
        switch (msg.action) {
            case 'init': {
                const payload = msg.payload as Record<string, unknown>;
                const nextPluginId = payload.pluginId;
                if (typeof nextPluginId !== 'string' || nextPluginId.length === 0) {
                    throw new Error('Worker init missing pluginId');
                }
                pluginId = nextPluginId;
                settingsSnapshot = { ...(payload.settings as Record<string, unknown> ?? {}) };
                storageSnapshot = { ...(payload.storage as Record<string, unknown> ?? {}) };
                await ensurePluginModule();
                postHostResponse(msg.requestId, null);
                return;
            }
            case 'activate': {
                await activatePlugin();
                postHostResponse(msg.requestId, null);
                return;
            }
            case 'deactivate': {
                await deactivatePlugin();
                postHostResponse(msg.requestId, null);
                return;
            }
            case 'execute-command': {
                const payload = msg.payload as Record<string, unknown>;
                const commandId = payload.commandId;
                const args = payload.args;
                const trace = payload.trace;
                if (typeof commandId !== 'string' || commandId.length === 0) {
                    throw new Error('Worker execute-command missing commandId');
                }
                if (!Array.isArray(args)) {
                    throw new Error('Worker execute-command invalid args');
                }
                const result = await executeCommand(
                    commandId,
                    args,
                    Array.isArray(trace) ? (trace as string[]) : []
                );
                postHostResponse(msg.requestId, result);
                return;
            }
            default:
                throw new Error(`Unsupported host request action: ${String(msg.action)}`);
        }
    } catch (error) {
        postHostResponse(msg.requestId, undefined, error instanceof Error ? error.message : String(error));
    }
}

self.addEventListener('message', (event: MessageEvent<unknown>) => {
    const msg = event.data as
        | HostRequestMessage
        | WorkerResponseMessage
        | HostEventMessage
        | undefined;
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

    if (msg.type === 'host-request') {
        void handleHostRequest(msg);
        return;
    }

    if (msg.type === 'worker-response') {
        handleWorkerResponse(msg);
        return;
    }

    if (msg.type === 'host-event') {
        handleHostEvent(msg);
    }
});
