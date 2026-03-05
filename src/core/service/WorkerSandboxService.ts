import type {
    HostEventMessage,
    HostMessagePayload,
    HostRequestAction,
    HostRequestMessage,
    HostResponseMessage,
    PluginWorkerRecord,
    WorkerRequestMessage,
    WorkerResponseMessage,
} from '../../domain/worker';
import type { ExecuteCommandPipelineOptions } from '../../domain/runtime';
import { CapabilityRegistry } from '../CapabilityRegistry';
import { PluginDisposable } from '../PluginDisposable';
import { PluginEventBus } from '../PluginEventBus';
import { PluginActivationService } from './PluginActivationService';
import { PluginSettingService } from './PluginSettingService';
import { PluginStorageService } from './PluginStorageService';

interface WorkerSandboxServiceDeps {
    capabilityRegistry: CapabilityRegistry;
    pluginActivationService: PluginActivationService;
    pluginEventBus: PluginEventBus;
    pluginDisposable: PluginDisposable;
    pluginStorageService: PluginStorageService;
    pluginSettingService: PluginSettingService;
}

type CommandExecutor = (
    commandId: string,
    options: ExecuteCommandPipelineOptions,
    ...args: unknown[]
) => Promise<unknown>;

interface WorkerMethodContext {
    pluginId: string;
}

type WorkerMethodHandler = (
    context: WorkerMethodContext,
    params: unknown
) => Promise<unknown>;

/**
 * Worker 沙箱服务：
 * 1) 每个插件一个 Worker，隔离插件命令执行上下文。
 * 2) 负责宿主与 Worker 间消息桥接。
 * 3) 采用“通用 method 分发”机制，新增能力只需注册处理器。
 */
export class WorkerSandboxService {
    private readonly workers = new Map<string, PluginWorkerRecord>();
    private readonly workerMethodHandlers = new Map<string, WorkerMethodHandler>();
    private requestSerial = 0;
    private commandExecutor: CommandExecutor | null = null;
    private viewActivator: ((viewId: string) => void) | null = null;

    constructor(private readonly deps: WorkerSandboxServiceDeps) {
        this.registerBuiltinWorkerMethods();

        // 全局释放：应用退出或运行时重建时回收全部 Worker。
        deps.pluginDisposable.add('__global__', async () => {
            await this.disposeAll();
        });

        // 同步设置变更到对应插件 Worker，驱动 settings.onChange 回调。
        deps.pluginDisposable.add(
            '__global__',
            deps.pluginEventBus.on('setting.changed', (payload: unknown) => {
                if (!payload || typeof payload !== 'object') return;
                const { pluginId, key, value } = payload as {
                    pluginId?: unknown;
                    key?: unknown;
                    value?: unknown;
                };
                if (typeof pluginId !== 'string' || typeof key !== 'string') return;
                this.postHostEvent(pluginId, 'setting.changed', { key, value });
            })
        );
    }

    /**
     * 注册“插件内发起命令调用”回调（由 runtime 注入）。
     */
    setCommandExecutor(executor: CommandExecutor): void {
        this.commandExecutor = executor;
    }

    /**
     * 注册“激活视图”回调（由 runtime 注入）。
     */
    setViewActivator(activate: (viewId: string) => void): void {
        this.viewActivator = activate;
    }

    async activate(pluginId: string): Promise<void> {
        const record = await this.getOrCreate(pluginId);
        if (record.active) return;
        await this.callWorker(record, 'activate', { pluginId });
        record.active = true;
    }

    async deactivate(pluginId: string): Promise<void> {
        const record = this.workers.get(pluginId);
        if (!record) return;

        try {
            await this.callWorker(record, 'deactivate', { pluginId });
        } finally {
            await this.disposePlugin(pluginId);
        }
    }

    /**
     * 对外暴露的命令执行入口。
     */
    async executeCommand(
        pluginId: string,
        commandId: string,
        args: unknown[],
        trace: string[]
    ): Promise<unknown> {
        const record = await this.getOrCreate(pluginId);
        return this.callWorker(record, 'execute-command', { pluginId, commandId, args, trace });
    }

    // =================================== 以下是内部方法 ==================================

    private registerBuiltinWorkerMethods(): void {
        this.registerWorkerMethod('command.execute', async (context, params) => {
            const payload = this.asRecord(params);
            const commandId = payload.commandId;
            const args = payload.args;
            const trace = payload.trace;
            if (typeof commandId !== 'string' || commandId.length === 0) {
                throw new Error('Worker method command.execute missing commandId');
            }
            if (!Array.isArray(args)) {
                throw new Error('Worker method command.execute invalid args');
            }
            if (this.commandExecutor === null) {
                throw new Error('Command executor not configured');
            }
            return this.commandExecutor(
                commandId,
                {
                    callerPluginId: context.pluginId,
                    trace: Array.isArray(trace) ? (trace as string[]) : [],
                },
                ...args
            );
        });

        this.registerWorkerMethod('view.activate', async (_context, params) => {
            const payload = this.asRecord(params);
            const viewId = payload.viewId;
            if (typeof viewId !== 'string' || viewId.length === 0) {
                throw new Error('Worker method view.activate missing viewId');
            }
            if (this.viewActivator) {
                this.viewActivator(viewId);
            }
            return null;
        });

        this.registerWorkerMethod('settings.set', async (context, params) => {
            const payload = this.asRecord(params);
            const key = payload.key;
            if (typeof key !== 'string' || key.length === 0) {
                throw new Error('Worker method settings.set missing key');
            }
            await this.deps.pluginSettingService.persist(context.pluginId, key, payload.value);
            return null;
        });

        this.registerWorkerMethod('storage.set', async (context, params) => {
            const payload = this.asRecord(params);
            const key = payload.key;
            if (typeof key !== 'string' || key.length === 0) {
                throw new Error('Worker method storage.set missing key');
            }
            await this.deps.pluginStorageService.persist(context.pluginId, key, payload.value);
            return null;
        });

        this.registerWorkerMethod('event.emit', async (_context, params) => {
            const payload = this.asRecord(params);
            const eventName = payload.event;
            if (typeof eventName !== 'string' || eventName.length === 0) {
                throw new Error('Worker method event.emit missing event');
            }
            // 广播到全部已激活 Worker，实现插件间事件联动。
            for (const targetPluginId of this.workers.keys()) {
                this.postHostEvent(targetPluginId, eventName, payload.payload);
            }
            return null;
        });

        this.registerWorkerMethod('capability.invoke', async (context, params) => {
            const payload = this.asRecord(params);
            const capabilityId = payload.capabilityId;
            const methodName = payload.method;
            const args = payload.args;
            if (typeof capabilityId !== 'string' || capabilityId.length === 0) {
                throw new Error('Worker method capability.invoke missing capabilityId');
            }
            if (typeof methodName !== 'string' || methodName.length === 0) {
                throw new Error('Worker method capability.invoke missing method');
            }
            if (!Array.isArray(args)) {
                throw new Error('Worker method capability.invoke invalid args');
            }
            return this.deps.capabilityRegistry.invoke(context.pluginId, capabilityId, methodName, args);
        });
    }

    /**
     * 注册 Worker -> Host 方法处理器。
     * 返回值为注销函数，方便后续按需扩展能力。
     */
    private registerWorkerMethod(method: string, handler: WorkerMethodHandler): () => void {
        if (this.workerMethodHandlers.has(method)) {
            throw new Error(`Duplicated worker method handler: ${method}`);
        }
        this.workerMethodHandlers.set(method, handler);
        return () => {
            this.workerMethodHandlers.delete(method);
        };
    }

    private asRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object') {
            return {};
        }
        return value as Record<string, unknown>;
    }

    private async getOrCreate(pluginId: string): Promise<PluginWorkerRecord> {
        const existing = this.workers.get(pluginId);
        if (existing) return existing;

        if (!this.deps.pluginActivationService.isPluginActivated(pluginId)) {
            throw new Error(`Cannot create sandbox for inactive plugin: ${pluginId}`);
        }

        // Worker 入口文件在 src/core/sandbox/worker.ts。
        const worker = new Worker(new URL('../sandbox/worker.ts', import.meta.url), {
            type: 'module',
        });

        const record: PluginWorkerRecord = {
            pluginId,
            worker,
            active: false,
            pendingRequests: new Map(),
        };

        worker.onmessage = (e) => this.handleWorkerMessage(pluginId, e);
        worker.onerror = (e) => this.handleWorkerError(pluginId, e);
        worker.onmessageerror = () => {
            this.failPendingRequests(pluginId, new Error(`Worker message deserialize failed: ${pluginId}`));
        };

        this.workers.set(pluginId, record);

        const storage = await this.deps.pluginStorageService.getSnapshot<Record<string, unknown>>(pluginId);
        const settings = await this.deps.pluginSettingService.getSnapshot(pluginId);
        await this.callWorker(record, 'init', {
            pluginId,
            storage,
            settings,
        });
        return record;
    }

    private callWorker(
        record: PluginWorkerRecord,
        action: HostRequestAction,
        payload: HostMessagePayload
    ): Promise<unknown> {
        this.requestSerial += 1;
        const requestId = `${record.pluginId}:${this.requestSerial}`;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (!record.pendingRequests.has(requestId)) return;
                record.pendingRequests.delete(requestId);
                reject(new Error(`Worker request timeout: ${action}`));
            }, 10_000);

            const cleanup = () => clearTimeout(timeout);
            const wrappedResolve = (value: unknown) => {
                cleanup();
                resolve(value);
            };
            const wrappedReject = (reason: unknown) => {
                cleanup();
                reject(reason);
            };

            record.pendingRequests.set(requestId, {
                resolve: wrappedResolve,
                reject: wrappedReject,
            });

            const message: HostRequestMessage = {
                type: 'host-request',
                requestId,
                action,
                payload,
            };
            record.worker.postMessage(message);
        });
    }

    private handleWorkerMessage(pluginId: string, event: MessageEvent): void {
        const msg = event.data as HostResponseMessage | WorkerRequestMessage | undefined;
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

        if (msg.type === 'host-response') {
            const record = this.workers.get(pluginId);
            if (!record) return;

            const pending = record.pendingRequests.get(msg.requestId);
            if (!pending) return;

            record.pendingRequests.delete(msg.requestId);
            if (msg.error) {
                pending.reject(new Error(msg.error));
            } else {
                pending.resolve(msg.result);
            }
            return;
        }

        if (msg.type === 'worker-request') {
            void this.handleWorkerRequest(pluginId, msg);
        }
    }

    private async handleWorkerRequest(pluginId: string, msg: WorkerRequestMessage): Promise<void> {
        const record = this.workers.get(pluginId);
        if (!record) return;

        try {
            const result = await this.dispatchWorkerRequest(pluginId, msg);
            const response: WorkerResponseMessage = {
                type: 'worker-response',
                requestId: msg.requestId,
                result,
            };
            record.worker.postMessage(response);
        } catch (error) {
            const response: WorkerResponseMessage = {
                type: 'worker-response',
                requestId: msg.requestId,
                error: error instanceof Error ? error.message : String(error),
            };
            record.worker.postMessage(response);
        }
    }

    private async dispatchWorkerRequest(pluginId: string, msg: WorkerRequestMessage): Promise<unknown> {
        if (typeof msg.method !== 'string' || msg.method.length === 0) {
            throw new Error('Worker request missing method');
        }

        const handler = this.workerMethodHandlers.get(msg.method);
        if (!handler) {
            throw new Error(`Unsupported worker method: ${msg.method}`);
        }

        return handler({ pluginId }, msg.params);
    }

    private postHostEvent(pluginId: string, eventName: string, payload: unknown): void {
        const record = this.workers.get(pluginId);
        if (!record) return;
        const message: HostEventMessage = {
            type: 'host-event',
            event: eventName,
            payload,
        };
        record.worker.postMessage(message);
    }

    private handleWorkerError(pluginId: string, error: ErrorEvent): void {
        console.error(`[Sandbox] Worker error for ${pluginId}:`, error);
        this.failPendingRequests(
            pluginId,
            new Error(
                `[Sandbox] Worker startup/runtime failed for ${pluginId}: ${error.message || 'unknown'}`
            )
        );
    }

    private failPendingRequests(pluginId: string, reason: Error): void {
        const record = this.workers.get(pluginId);
        if (!record) return;
        for (const { reject } of record.pendingRequests.values()) {
            reject(reason);
        }
        record.pendingRequests.clear();
    }

    async disposePlugin(pluginId: string): Promise<void> {
        const record = this.workers.get(pluginId);
        if (!record) return;

        for (const { reject } of record.pendingRequests.values()) {
            reject(new Error(`Plugin ${pluginId} deactivated`));
        }
        record.pendingRequests.clear();

        record.worker.terminate();
        this.workers.delete(pluginId);
    }

    /**
     * 统一释放全部插件 Worker（优先走 deactivate，确保插件有机会执行清理逻辑）。
     */
    private async disposeAll(): Promise<void> {
        const pluginIds = Array.from(this.workers.keys());
        for (const pluginId of pluginIds) {
            try {
                await this.deactivate(pluginId);
            } catch (error) {
                console.error(`[Sandbox] Failed to deactivate worker ${pluginId}:`, error);
                await this.disposePlugin(pluginId);
            }
        }
    }
}
