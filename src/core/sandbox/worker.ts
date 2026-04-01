import type { EventsCapability, PluginHostAPI, SettingsCapability } from '../../domain/api';
import type { CapabilityById, CapabilityContract } from '../../domain/capability';
import {
    createWorkerRpcClient,
    createWorkerRpcServer,
    type WorkerRpcEndpoint,
} from '../utils/communicationUtils';
import type {
    PluginModule,
    CommandExecutionContext,
} from '../../domain/protocol/plugin-module.protocol';
import { importByUrl } from '../utils/pluginUtils';

const WORKER_RPC_CHANNEL = 'plugin-worker-runtime';

interface InvokeHostMethodPayload {
    method: string;
    params?: unknown;
}

declare global {
    interface WorkerGlobalScope {
        __PLUG_BOX_API_FACTORY__?: () => Promise<PluginHostAPI>;
    }
}

let pluginId = '';
// 内部的moduleUrl使用提前解析好的完整路径
let moduleUrl = '';
let pluginModule: PluginModule | null = null;
let activated = false;
let activeTrace: string[] = [];

const capabilityCache = new Map<string, CapabilityContract>();

const settingWatchers = new Map<string, Set<(value: unknown) => void>>();
const settingSubscriptionByKey = new Map<string, string>();

const eventWatchers = new Map<string, Set<(payload: unknown) => void>>();
const eventSubscriptionByName = new Map<string, string>();

const endpoint = self as unknown as WorkerRpcEndpoint;
const rpcClient = createWorkerRpcClient({
    channel: WORKER_RPC_CHANNEL,
    endpoint,
    requestTimeoutMs: 10_000,
    requestIdPrefix: 'worker-host',
});
const rpcServer = createWorkerRpcServer({
    channel: WORKER_RPC_CHANNEL,
    endpoint,
});

// 确保主模块index.js存在并加载
async function ensurePluginModule(): Promise<PluginModule> {
    if (pluginModule) return pluginModule;
    if (!pluginId) {
        throw new Error('Worker not initialized: missing pluginId');
    }
    if (!moduleUrl) {
        throw new Error(`Worker not initialized: missing moduleUrl for ${pluginId}`);
    }
    const loaded = await importByUrl(moduleUrl);
    if (!loaded.default) {
        throw new Error(`Plugin module default export missing: ${moduleUrl}`);
    }

    const module = loaded.default as PluginModule;
    if (module.pluginId !== pluginId) {
        throw new Error(`Plugin id mismatch: manifest="${pluginId}", module="${module.pluginId}"`);
    }

    pluginModule = module;
    return pluginModule;
}

async function callHost(method: string, params?: unknown): Promise<unknown> {
    const payload: InvokeHostMethodPayload = { method, params };
    return rpcClient.call('invokeHostMethod', payload);
}

async function ensureSettingSubscription(key: string): Promise<void> {
    if (settingSubscriptionByKey.has(key)) return;

    const subscriptionId = await callHost('settings.subscribe', key);
    if (typeof subscriptionId !== 'string' || subscriptionId.length === 0) {
        throw new Error(`settings.subscribe failed for key: ${key}`);
    }

    settingSubscriptionByKey.set(key, subscriptionId);
}

async function releaseSettingSubscriptionIfUnused(key: string): Promise<void> {
    const watchers = settingWatchers.get(key);
    if (watchers && watchers.size > 0) return;

    const subscriptionId = settingSubscriptionByKey.get(key);
    if (!subscriptionId) return;

    settingSubscriptionByKey.delete(key);
    await callHost('settings.unsubscribe', subscriptionId);
}

async function ensureEventSubscription(eventName: string): Promise<void> {
    if (eventSubscriptionByName.has(eventName)) return;

    const subscriptionId = await callHost('events.subscribe', eventName);
    if (typeof subscriptionId !== 'string' || subscriptionId.length === 0) {
        throw new Error(`events.subscribe failed for event: ${eventName}`);
    }

    eventSubscriptionByName.set(eventName, subscriptionId);
}

async function releaseEventSubscriptionIfUnused(eventName: string): Promise<void> {
    const watchers = eventWatchers.get(eventName);
    if (watchers && watchers.size > 0) return;

    const subscriptionId = eventSubscriptionByName.get(eventName);
    if (!subscriptionId) return;

    eventSubscriptionByName.delete(eventName);
    await callHost('events.unsubscribe', subscriptionId);
}

// 创建一个代理对象，这里使用代理对象的意义是自动获取到methodName，否则就要写callHost(`${capabilityId}`, 'open')
// 其他能力需要一些特殊实现，所以不走代理对象
function createDynamicCapabilityProxy(capabilityId: string): CapabilityContract {
    const existing = capabilityCache.get(capabilityId);
    if (existing) return existing;

    // 一个空对象的代理对象，只要访问属性就必定触发get陷阱
    const proxy = new Proxy(
        {},
        {
            // 空对象_target自然无意义，也不需要使用到
            get: (_target, methodName) => {
                if (typeof methodName !== 'string') return undefined;
                return (...args: unknown[]) =>
                    callHost(
                        `${capabilityId}.${methodName}`,
                        args.length <= 1 ? args[0] : args
                    );
            },
        }
    ) as CapabilityContract;

    capabilityCache.set(capabilityId, proxy);
    return proxy;
}

function createSettingsCapability(): SettingsCapability {
    return {
        get: async <T>(key: string): Promise<T | undefined> => {
            return (await callHost('settings.get', key)) as T | undefined;
        },
        set: async (key: string, value: unknown): Promise<void> => {
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
            void ensureSettingSubscription(key);

            return {
                dispose: () => {
                    watchers?.delete(wrapped);
                    if (watchers && watchers.size === 0) {
                        settingWatchers.delete(key);
                    }
                    void releaseSettingSubscriptionIfUnused(key);
                },
            };
        },
    };
}

function createEventsCapability(): EventsCapability {
    return {
        emit: (eventName: string, payload?: unknown): void => {
            void callHost('events.emit', { event: eventName, payload });
        },
        on: (eventName: string, handler: (payload: unknown) => void) => {
            let watchers = eventWatchers.get(eventName);
            if (!watchers) {
                watchers = new Set();
                eventWatchers.set(eventName, watchers);
            }

            watchers.add(handler);
            void ensureEventSubscription(eventName);

            return {
                dispose: () => {
                    watchers?.delete(handler);
                    if (watchers && watchers.size === 0) {
                        eventWatchers.delete(eventName);
                    }
                    void releaseEventSubscriptionIfUnused(eventName);
                },
            };
        },
    };
}

const hostApi: PluginHostAPI = {
    get pluginId() {
        return pluginId;
    },
    call: async <T = unknown>(method: string, params?: unknown): Promise<T> => {
        return (await callHost(method, params)) as T;
    },
    get: <K extends string>(capabilityId: K): CapabilityById<K> => {
        if (capabilityId === 'settings') {
            return createSettingsCapability() as CapabilityById<K>;
        }

        if (capabilityId === 'events') {
            return createEventsCapability() as CapabilityById<K>;
        }

        return createDynamicCapabilityProxy(capabilityId) as CapabilityById<K>;
    },
};

const workerScope = self as unknown as WorkerGlobalScope;
workerScope.__PLUG_BOX_API_FACTORY__ = async () => hostApi;

async function executeCommand(commandId: string, args: unknown[], trace: string[]): Promise<unknown> {
    const module = await ensurePluginModule();
    const handler = module.commands?.[commandId];
    if (!handler) {
        throw new Error(`Command handler not found in plugin "${pluginId}": ${commandId}`);
    }

    const previousTrace = activeTrace;
    activeTrace = trace;
    try {
        const context: CommandExecutionContext = {
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

rpcServer.register('init', async (payload) => {
    const data = payload as { pluginId?: unknown; moduleUrl?: unknown };
    if (typeof data?.pluginId !== 'string' || data.pluginId.length === 0) {
        throw new Error('Worker init missing pluginId');
    }
    if (typeof data?.moduleUrl !== 'string' || data.moduleUrl.length === 0) {
        throw new Error('Worker init missing moduleUrl');
    }

    pluginId = data.pluginId;
    moduleUrl = data.moduleUrl;
    pluginModule = null;

    settingWatchers.clear();
    settingSubscriptionByKey.clear();
    eventWatchers.clear();
    eventSubscriptionByName.clear();
    capabilityCache.clear();

    await ensurePluginModule();
    return null;
});

rpcServer.register('activate', async () => {
    await activatePlugin();
    return null;
});

rpcServer.register('deactivate', async () => {
    await deactivatePlugin();
    return null;
});

rpcServer.register('executeCommand', async (payload) => {
    const data = payload as { commandId?: unknown; args?: unknown; trace?: unknown };
    if (typeof data?.commandId !== 'string' || data.commandId.length === 0) {
        throw new Error('Worker executeCommand missing commandId');
    }
    if (!Array.isArray(data.args)) {
        throw new Error('Worker executeCommand invalid args');
    }

    return executeCommand(
        data.commandId,
        data.args,
        Array.isArray(data.trace) ? (data.trace as string[]) : []
    );
});

// =========================================== 上面是worker service的方法，下面是 worker client的方法 ===============================================

function emitSettingValue(key: string, value: unknown): void {
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

function emitEventPayload(eventName: string, payload: unknown): void {
    const watchers = eventWatchers.get(eventName);
    if (!watchers) return;

    for (const watcher of watchers) {
        try {
            watcher(payload);
        } catch (error) {
            console.error(`[plugin-worker] events.on callback failed: ${eventName}`, error);
        }
    }
}

function handleCapabilitySubscription(payload: unknown): void {
    const data = payload as { subscriptionId?: unknown; data?: unknown };
    if (!data || typeof data !== 'object') return;
    if (typeof data.subscriptionId !== 'string') return;

    for (const [key, subscriptionId] of settingSubscriptionByKey.entries()) {
        if (subscriptionId === data.subscriptionId) {
            emitSettingValue(key, data.data);
            return;
        }
    }

    for (const [eventName, subscriptionId] of eventSubscriptionByName.entries()) {
        if (subscriptionId === data.subscriptionId) {
            emitEventPayload(eventName, data.data);
            return;
        }
    }
}

rpcClient.on('capability.subscription', (payload) => {
    handleCapabilitySubscription(payload);
});