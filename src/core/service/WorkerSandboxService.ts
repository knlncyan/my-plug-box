import type { ExecuteCommandPipelineOptions } from '../../domain/runtime';
import { CapabilityRegistry } from '../CapabilityRegistry';
import { PluginDisposable } from '../PluginDisposable';
import { PluginEventBus } from '../PluginEventBus';
import {
    createWorkerRpcClient,
    createWorkerRpcServer,
    type WorkerRpcClient,
    type WorkerRpcEndpoint,
    type WorkerRpcServer,
} from '../utils/communicationUtils';
import { PluginRuntimeCatalogService } from './PluginRuntimeCatalogService';
import { PluginSettingService } from './PluginSettingService';
import { PluginStorageService } from './PluginStorageService';

const WORKER_RPC_CHANNEL = 'plugin-worker-runtime';

interface WorkerSandboxServiceDeps {
    capabilityRegistry: CapabilityRegistry;
    pluginRuntimeCatalogService: PluginRuntimeCatalogService;
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

interface WorkerSessionRecord {
    pluginId: string;
    worker: Worker;
    active: boolean;
    rpcClient: WorkerRpcClient;
    rpcServer: WorkerRpcServer;
    unregisterHostMethod: () => void;
}

interface SettingSubscriptionRecord {
    pluginId: string;
    key: string;
}

interface EventSubscriptionRecord {
    pluginId: string;
    eventName: string;
}

export interface CapabilitySubscriptionPush {
    pluginId: string;
    subscriptionId: string;
    data: unknown;
}

// 1.Host -> Worker
//     Host 用 rpcClient.call('init'|'activate'|'executeCommand')
//     Worker 用 rpcServer.register(...) 接这些请求
// 2.Worker -> Host
//     Worker 用 rpcClient.call('invokeHostMethod')
//     Host 用 rpcServer.register('invokeHostMethod', ...) 处理
// 3.订阅推送（事件）
//     Host rpcServer.emit('capability.subscription')
//     Worker rpcClient.on('capability.subscription')
export class WorkerSandboxService {
    private readonly workers = new Map<string, WorkerSessionRecord>();
    private readonly settingSubscriptions = new Map<string, SettingSubscriptionRecord>();
    private readonly eventSubscriptions = new Map<string, EventSubscriptionRecord>();
    private readonly subscriptionPushListeners = new Set<(push: CapabilitySubscriptionPush) => void>();

    private subscriptionSerial = 0;
    private commandExecutor: CommandExecutor | null = null;
    private viewActivator: ((viewId: string) => void) | null = null;

    /**
     * 构造函数：注册内置能力、挂载全局清理、桥接设置变更事件。
     */
    constructor(private readonly deps: WorkerSandboxServiceDeps) {
        this.registerBuiltinCapabilities();

        deps.pluginDisposable.add('__global__', async () => {
            await this.disposeAll();
            this.settingSubscriptions.clear();
            this.eventSubscriptions.clear();
            this.subscriptionPushListeners.clear();
        });

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

                for (const [subscriptionId, record] of this.settingSubscriptions.entries()) {
                    if (record.pluginId !== pluginId || record.key !== key) continue;
                    this.emitCapabilitySubscription(pluginId, subscriptionId, value);
                }
            })
        );
    }

    /**
     * 注入运行时依赖：命令执行器与视图激活器。
     */
    init(executor: CommandExecutor, activate: (viewId: string) => void): void {
        this.commandExecutor = executor;
        this.viewActivator = activate;
    }

    /**
     * 订阅能力推送事件（用于观测 settings/events 的推送消息）。
     * 可以提供给插件视图方
     */
    onSubscriptionPush(listener: (push: CapabilitySubscriptionPush) => void): () => void {
        this.subscriptionPushListeners.add(listener);
        return () => {
            this.subscriptionPushListeners.delete(listener);
        };
    }

    /**
     * 激活插件：按需创建 worker，并调用 worker.activate。
     */
    async activate(pluginId: string): Promise<void> {
        const record = await this.getOrCreate(pluginId);
        if (record.active) return;
        await this.callWorker(record, 'activate');
        record.active = true;
    }

    /**
     * 反激活插件：调用 worker.deactivate 后释放本地会话资源。
     */
    async deactivate(pluginId: string): Promise<void> {
        const record = this.workers.get(pluginId);
        if (!record) return;

        try {
            await this.callWorker(record, 'deactivate');
        } finally {
            await this.disposePlugin(pluginId);
        }
    }

    /**
     * 执行插件命令：通过 RPC 转发到对应 worker。
     */
    async executeCommand(pluginId: string, commandId: string, args: unknown[], trace: string[]): Promise<unknown> {
        const record = await this.getOrCreate(pluginId);
        return this.callWorker(record, 'executeCommand', { commandId, args, trace });
    }

    /**
     * 宿主方法调用入口：供上层按 method + params 直接调用能力。
     */
    async invokeHostMethod(pluginId: string, method: string, params?: unknown): Promise<unknown> {
        return this.dispatchHostMethod({ pluginId }, method, params);
    }

    /**
     * 注册内置能力：commands/views/settings/storage/events。
     */
    private registerBuiltinCapabilities(): void {
        this.deps.capabilityRegistry.register('commands', ({ pluginId }) => ({
            execute: async (commandIdOrPayload: unknown, ...restArgs: unknown[]): Promise<unknown> => {
                if (this.commandExecutor === null) {
                    throw new Error('Command executor not configured');
                }

                let commandId: unknown = commandIdOrPayload;
                let args: unknown[] = restArgs;
                let trace: string[] = [];

                if (typeof commandIdOrPayload !== 'string') {
                    const payload = this.asRecord(commandIdOrPayload);
                    commandId = payload.commandId;
                    args = Array.isArray(payload.args) ? payload.args : [];
                    trace = Array.isArray(payload.trace)
                        ? payload.trace.filter((item): item is string => typeof item === 'string')
                        : [];
                }

                if (typeof commandId !== 'string' || commandId.length === 0) {
                    throw new Error('Capability commands.execute missing commandId');
                }

                return this.commandExecutor(
                    commandId,
                    {
                        callerPluginId: pluginId,
                        trace,
                    },
                    ...args
                );
            },
        }));

        this.deps.capabilityRegistry.register('views', () => ({
            activate: (viewIdOrPayload: unknown): null => {
                const viewId = this.readStringArg('views.activate', viewIdOrPayload, 'viewId');
                if (this.viewActivator) {
                    this.viewActivator(viewId);
                }
                return null;
            },
        }));

        this.deps.capabilityRegistry.register('settings', ({ pluginId }) => ({
            get: async <T>(keyOrPayload: unknown): Promise<T | undefined> => {
                const key = this.readStringArg('settings.get', keyOrPayload, 'key');
                return this.deps.pluginSettingService.get(pluginId, key);
            },
            set: async (keyOrPayload: unknown, value?: unknown): Promise<void> => {
                const key = this.readStringArg('settings.set', keyOrPayload, 'key');
                const nextValue = typeof keyOrPayload === 'string' ? value : this.asRecord(keyOrPayload).value;
                await this.deps.pluginSettingService.persist(pluginId, key, nextValue);
            },
            subscribe: async (keyOrPayload: unknown): Promise<string> => {
                const key = this.readStringArg('settings.subscribe', keyOrPayload, 'key');
                const subscriptionId = this.nextSubscriptionId('settings');
                this.settingSubscriptions.set(subscriptionId, { pluginId, key });
                return subscriptionId;
            },
            unsubscribe: async (subscriptionIdOrPayload: unknown): Promise<null> => {
                const subscriptionId = this.readStringArg('settings.unsubscribe', subscriptionIdOrPayload, 'subscriptionId');
                this.settingSubscriptions.delete(subscriptionId);
                return null;
            },
            onChange: <T>(key: string, handler: (value: T | undefined) => void) => {
                const unsubscribe = this.deps.pluginEventBus.on('setting.changed', (payload) => {
                    if (!payload || typeof payload !== 'object') return;
                    const data = payload as { pluginId?: unknown; key?: unknown; value?: unknown };
                    if (data.pluginId !== pluginId || data.key !== key) return;
                    handler(data.value as T | undefined);
                });
                return { dispose: unsubscribe };
            },
        }));

        this.deps.capabilityRegistry.register('storage', ({ pluginId }) => ({
            get: async <T>(keyOrPayload: unknown): Promise<T | undefined> => {
                const key = this.readStringArg('storage.get', keyOrPayload, 'key');
                return this.deps.pluginStorageService.get(pluginId, key);
            },
            set: async (keyOrPayload: unknown, value?: unknown): Promise<void> => {
                const key = this.readStringArg('storage.set', keyOrPayload, 'key');
                const nextValue = typeof keyOrPayload === 'string' ? value : this.asRecord(keyOrPayload).value;
                await this.deps.pluginStorageService.persist(pluginId, key, nextValue);
            },
        }));

        this.deps.capabilityRegistry.register('events', ({ pluginId }) => ({
            emit: (eventOrPayload: unknown, payload?: unknown): null => {
                const eventName = this.readStringArg('events.emit', eventOrPayload, 'event');
                const eventPayload = typeof eventOrPayload === 'string' ? payload : this.asRecord(eventOrPayload).payload;

                this.deps.pluginEventBus.emit(eventName, eventPayload);

                for (const [subscriptionId, record] of this.eventSubscriptions.entries()) {
                    if (record.pluginId !== pluginId || record.eventName !== eventName) continue;
                    this.emitCapabilitySubscription(pluginId, subscriptionId, eventPayload);
                }

                return null;
            },
            subscribe: async (eventOrPayload: unknown): Promise<string> => {
                const eventName = this.readStringArg('events.subscribe', eventOrPayload, 'event');
                const subscriptionId = this.nextSubscriptionId('events');
                this.eventSubscriptions.set(subscriptionId, { pluginId, eventName });
                return subscriptionId;
            },
            unsubscribe: async (subscriptionIdOrPayload: unknown): Promise<null> => {
                const subscriptionId = this.readStringArg('events.unsubscribe', subscriptionIdOrPayload, 'subscriptionId');
                this.eventSubscriptions.delete(subscriptionId);
                return null;
            },
            on: (eventName: string, handler: (payload: unknown) => void) => {
                const unsubscribe = this.deps.pluginEventBus.on(eventName, handler);
                return { dispose: unsubscribe };
            },
        }));
    }

    // 生成唯一订阅号
    private nextSubscriptionId(type: 'settings' | 'events'): string {
        this.subscriptionSerial += 1;
        return `${type}:${this.subscriptionSerial}`;
    }

    private emitCapabilitySubscription(pluginId: string, subscriptionId: string, data: unknown): void {
        const payload = { subscriptionId, data };
        this.postHostEvent(pluginId, 'capability.subscription', payload);

        const push: CapabilitySubscriptionPush = { pluginId, subscriptionId, data };
        for (const listener of this.subscriptionPushListeners) {
            try {
                listener(push);
            } catch (error) {
                console.error('[Sandbox] subscription listener failed:', error);
            }
        }
    }

    /**
     * 分发 worker 发来的能力调用（capability.method -> CapabilityRegistry.invoke）。
     */
    private dispatchHostMethod(context: WorkerMethodContext, method: string, params?: unknown): Promise<unknown> {
        if (typeof method !== 'string' || method.length === 0) {
            throw new Error('Worker request missing method');
        }

        const separatorIndex = method.indexOf('.');
        if (separatorIndex <= 0 || separatorIndex >= method.length - 1) {
            throw new Error(`Unsupported worker method: ${method}`);
        }

        const capabilityId = method.slice(0, separatorIndex);
        const methodName = method.slice(separatorIndex + 1);
        const invokeArgs = params === undefined ? [] : Array.isArray(params) ? params : [params];
        return this.deps.capabilityRegistry.invoke(context.pluginId, capabilityId, methodName, invokeArgs);
    }

    private asRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object') {
            return {};
        }
        return value as Record<string, unknown>;
    }

    private readStringArg(method: string, value: unknown, payloadKey: string): string {
        if (typeof value === 'string' && value.length > 0) {
            return value;
        }

        const payloadValue = this.asRecord(value)[payloadKey];
        if (typeof payloadValue !== 'string' || payloadValue.length === 0) {
            throw new Error(`Capability ${method} missing ${payloadKey}`);
        }
        return payloadValue;
    }

    /**
     * 获取或创建插件 worker 会话，并完成 init 握手。
     */
    private async getOrCreate(pluginId: string): Promise<WorkerSessionRecord> {
        const existing = this.workers.get(pluginId);
        if (existing) return existing;

        const manifest = this.deps.pluginRuntimeCatalogService.getPluginEntryById(pluginId);
        if (!manifest) {
            throw new Error(`Plugin manifest not found: ${pluginId}`);
        }

        if (!manifest.moduleUrl || manifest.moduleUrl.trim().length === 0) {
            throw new Error(`Plugin moduleUrl missing: ${pluginId}`);
        }

        const worker = new Worker(new URL('../sandbox/worker.ts', import.meta.url), {
            type: 'module',
        });

        const endpoint = worker as unknown as WorkerRpcEndpoint;
        const rpcClient = createWorkerRpcClient({
            channel: WORKER_RPC_CHANNEL,
            endpoint,
            requestTimeoutMs: 10_000,
            requestIdPrefix: pluginId,
        });
        const rpcServer = createWorkerRpcServer({ channel: WORKER_RPC_CHANNEL, endpoint });

        const unregisterHostMethod = rpcServer.register('invokeHostMethod', async (payload) => {
            const data = this.asRecord(payload);
            const method = data.method;
            if (typeof method !== 'string' || method.length === 0) {
                throw new Error('Worker invokeHostMethod missing method');
            }
            return this.dispatchHostMethod({ pluginId }, method, data.params);
        });

        const record: WorkerSessionRecord = {
            pluginId,
            worker,
            active: false,
            rpcClient,
            rpcServer,
            unregisterHostMethod,
        };

        worker.onerror = (error) => this.handleWorkerError(pluginId, error);
        worker.onmessageerror = () => this.handleWorkerMessageError(pluginId);

        this.workers.set(pluginId, record);

        try {
            await this.callWorker(record, 'init', {
                pluginId,
                moduleUrl: manifest.moduleUrl,
            });
            return record;
        } catch (error) {
            this.disposeWorkerSession(record, `Worker init failed: ${pluginId}`);
            this.workers.delete(pluginId);
            throw error;
        }
    }

    private callWorker(record: WorkerSessionRecord, method: string, params?: unknown): Promise<unknown> {
        return record.rpcClient.call(method, params);
    }

    // 发送主机事件，其实就是wokerService通知worker
    private postHostEvent(pluginId: string, eventName: string, payload: unknown): void {
        const record = this.workers.get(pluginId);
        if (!record) return;
        record.rpcServer.emit(eventName, payload);
    }

    private handleWorkerError(pluginId: string, error: ErrorEvent): void {
        console.error(`[Sandbox] Worker error for ${pluginId}:`, error);
        const record = this.workers.get(pluginId);
        if (!record) return;

        this.removePluginSubscriptions(pluginId);
        this.disposeWorkerSession(
            record,
            `[Sandbox] Worker startup/runtime failed for ${pluginId}: ${error.message || 'unknown'}`
        );
        this.workers.delete(pluginId);
    }

    private handleWorkerMessageError(pluginId: string): void {
        const record = this.workers.get(pluginId);
        if (!record) return;

        this.removePluginSubscriptions(pluginId);
        this.disposeWorkerSession(record, `Worker message deserialize failed: ${pluginId}`);
        this.workers.delete(pluginId);
    }

    // 销毁单个 worker 会话：取消注册、关闭 RPC、终止 worker。
    private disposeWorkerSession(record: WorkerSessionRecord, reason: string): void {
        try {
            record.unregisterHostMethod();
        } catch {
            // ignore
        }
        try {
            record.rpcClient.dispose(reason);
        } catch {
            // ignore
        }
        try {
            record.rpcServer.dispose();
        } catch {
            // ignore
        }
        try {
            record.worker.terminate();
        } catch {
            // ignore
        }
    }

    // 清除插件订阅的所有事件id
    private removePluginSubscriptions(pluginId: string): void {
        for (const [subscriptionId, record] of this.settingSubscriptions.entries()) {
            if (record.pluginId === pluginId) {
                this.settingSubscriptions.delete(subscriptionId);
            }
        }

        for (const [subscriptionId, record] of this.eventSubscriptions.entries()) {
            if (record.pluginId === pluginId) {
                this.eventSubscriptions.delete(subscriptionId);
            }
        }
    }

    private async disposePlugin(pluginId: string): Promise<void> {
        const record = this.workers.get(pluginId);
        if (!record) return;

        this.removePluginSubscriptions(pluginId);
        this.disposeWorkerSession(record, `Plugin ${pluginId} deactivated`);
        this.workers.delete(pluginId);
    }

    // 全量销毁所有插件 worker 资源。
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