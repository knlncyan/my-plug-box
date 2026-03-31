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

/**
 * Worker 濞屾瑧顔堥張宥呭閿? * 1) 缂佺喍绔村▔銊ュ斀鐎瑰じ瀵岄懗钘夊閵? * 2) 缂佺喍绔存担璺ㄦ暏 `閼宠棄濮?閺傝纭禶 鐠侯垳鏁遍懗钘夊鐠嬪啰鏁ら妴? * 3) 缂佺喍绔存担璺ㄦ暏閺嶅洤鍣?RPC 閸楀繗顔呴崪?Worker 闁矮淇婇妴? */
export class WorkerSandboxService {
    private readonly workers = new Map<string, WorkerSessionRecord>();
    private readonly settingSubscriptions = new Map<string, SettingSubscriptionRecord>();
    private readonly eventSubscriptions = new Map<string, EventSubscriptionRecord>();
    private readonly subscriptionPushListeners = new Set<(push: CapabilitySubscriptionPush) => void>();

    private subscriptionSerial = 0;
    private commandExecutor: CommandExecutor | null = null;
    private viewActivator: ((viewId: string) => void) | null = null;

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

    setCommandExecutor(executor: CommandExecutor): void {
        this.commandExecutor = executor;
    }

    setViewActivator(activate: (viewId: string) => void): void {
        this.viewActivator = activate;
    }

    onSubscriptionPush(listener: (push: CapabilitySubscriptionPush) => void): () => void {
        this.subscriptionPushListeners.add(listener);
        return () => {
            this.subscriptionPushListeners.delete(listener);
        };
    }

    async activate(pluginId: string): Promise<void> {
        const record = await this.getOrCreate(pluginId);
        if (record.active) return;
        await this.callWorker(record, 'activate');
        record.active = true;
    }

    async deactivate(pluginId: string): Promise<void> {
        const record = this.workers.get(pluginId);
        if (!record) return;

        try {
            await this.callWorker(record, 'deactivate');
        } finally {
            await this.disposePlugin(pluginId);
        }
    }

    async executeCommand(pluginId: string, commandId: string, args: unknown[], trace: string[]): Promise<unknown> {
        const record = await this.getOrCreate(pluginId);
        return this.callWorker(record, 'executeCommand', { commandId, args, trace });
    }

    async invokeHostMethod(pluginId: string, method: string, params?: unknown): Promise<unknown> {
        return this.dispatchHostMethod({ pluginId }, method, params);
    }

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
                const viewId = this.resolveViewId('views.activate', viewIdOrPayload);
                if (this.viewActivator) {
                    this.viewActivator(viewId);
                }
                return null;
            },
        }));

        this.deps.capabilityRegistry.register('settings', ({ pluginId }) => ({
            get: async <T>(keyOrPayload: unknown): Promise<T | undefined> => {
                const key = this.resolveKey('settings.get', keyOrPayload);
                return this.deps.pluginSettingService.get(pluginId, key);
            },
            set: async (keyOrPayload: unknown, value?: unknown): Promise<void> => {
                const key = this.resolveKey('settings.set', keyOrPayload);
                const nextValue =
                    typeof keyOrPayload === 'string'
                        ? value
                        : this.asRecord(keyOrPayload).value;
                await this.deps.pluginSettingService.persist(pluginId, key, nextValue);
            },
            subscribe: async (keyOrPayload: unknown): Promise<string> => {
                const key = this.resolveKey('settings.subscribe', keyOrPayload);
                const subscriptionId = this.nextSubscriptionId('settings');
                this.settingSubscriptions.set(subscriptionId, { pluginId, key });
                return subscriptionId;
            },
            unsubscribe: async (subscriptionIdOrPayload: unknown): Promise<null> => {
                const subscriptionId = this.resolveSubscriptionId('settings.unsubscribe', subscriptionIdOrPayload);
                this.settingSubscriptions.delete(subscriptionId);
                return null;
            },
            onChange: () => {
                throw new Error('Use settings.subscribe/settings.unsubscribe over RPC');
            },
        }));

        this.deps.capabilityRegistry.register('storage', ({ pluginId }) => ({
            get: async <T>(keyOrPayload: unknown): Promise<T | undefined> => {
                const key = this.resolveKey('storage.get', keyOrPayload);
                return this.deps.pluginStorageService.get(pluginId, key);
            },
            set: async (keyOrPayload: unknown, value?: unknown): Promise<void> => {
                const key = this.resolveKey('storage.set', keyOrPayload);
                const nextValue =
                    typeof keyOrPayload === 'string'
                        ? value
                        : this.asRecord(keyOrPayload).value;
                await this.deps.pluginStorageService.persist(pluginId, key, nextValue);
            },
        }));

        this.deps.capabilityRegistry.register('events', ({ pluginId }) => ({
            emit: (eventOrPayload: unknown, payload?: unknown): null => {
                const eventName = this.resolveEventName('events.emit', eventOrPayload);
                const eventPayload =
                    typeof eventOrPayload === 'string'
                        ? payload
                        : this.asRecord(eventOrPayload).payload;

                this.deps.pluginEventBus.emit(eventName, eventPayload);

                for (const [subscriptionId, record] of this.eventSubscriptions.entries()) {
                    if (record.pluginId !== pluginId || record.eventName !== eventName) continue;
                    this.emitCapabilitySubscription(pluginId, subscriptionId, eventPayload);
                }

                return null;
            },
            subscribe: async (eventOrPayload: unknown): Promise<string> => {
                const eventName = this.resolveEventName('events.subscribe', eventOrPayload);
                const subscriptionId = this.nextSubscriptionId('events');
                this.eventSubscriptions.set(subscriptionId, { pluginId, eventName });
                return subscriptionId;
            },
            unsubscribe: async (subscriptionIdOrPayload: unknown): Promise<null> => {
                const subscriptionId = this.resolveSubscriptionId('events.unsubscribe', subscriptionIdOrPayload);
                this.eventSubscriptions.delete(subscriptionId);
                return null;
            },
            on: () => {
                throw new Error('Use events.subscribe/events.unsubscribe over RPC');
            },
        }));
    }

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

    private parseMethod(method: string): { capabilityId: string; methodName: string } {
        const separatorIndex = method.indexOf('.');
        if (separatorIndex <= 0 || separatorIndex >= method.length - 1) {
            throw new Error(`Unsupported worker method: ${method}`);
        }

        return {
            capabilityId: method.slice(0, separatorIndex),
            methodName: method.slice(separatorIndex + 1),
        };
    }

    private dispatchHostMethod(context: WorkerMethodContext, method: string, params?: unknown): Promise<unknown> {
        if (typeof method !== 'string' || method.length === 0) {
            throw new Error('Worker request missing method');
        }

        const { capabilityId, methodName } = this.parseMethod(method);
        const invokeArgs = params === undefined ? [] : Array.isArray(params) ? params : [params];
        return this.deps.capabilityRegistry.invoke(context.pluginId, capabilityId, methodName, invokeArgs);
    }

    private resolveKey(method: string, keyOrPayload: unknown): string {
        if (typeof keyOrPayload === 'string' && keyOrPayload.length > 0) {
            return keyOrPayload;
        }

        const key = this.asRecord(keyOrPayload).key;
        if (typeof key !== 'string' || key.length === 0) {
            throw new Error(`Capability ${method} missing key`);
        }
        return key;
    }

    private resolveEventName(method: string, eventOrPayload: unknown): string {
        if (typeof eventOrPayload === 'string' && eventOrPayload.length > 0) {
            return eventOrPayload;
        }

        const eventName = this.asRecord(eventOrPayload).event;
        if (typeof eventName !== 'string' || eventName.length === 0) {
            throw new Error(`Capability ${method} missing event`);
        }
        return eventName;
    }

    private resolveSubscriptionId(method: string, subscriptionIdOrPayload: unknown): string {
        if (typeof subscriptionIdOrPayload === 'string' && subscriptionIdOrPayload.length > 0) {
            return subscriptionIdOrPayload;
        }

        const payload = this.asRecord(subscriptionIdOrPayload);
        const subscriptionId = payload.subscriptionId;
        if (typeof subscriptionId !== 'string' || subscriptionId.length === 0) {
            throw new Error(`Capability ${method} missing subscriptionId`);
        }
        return subscriptionId;
    }

    private resolveViewId(method: string, viewIdOrPayload: unknown): string {
        if (typeof viewIdOrPayload === 'string' && viewIdOrPayload.length > 0) {
            return viewIdOrPayload;
        }

        const viewId = this.asRecord(viewIdOrPayload).viewId;
        if (typeof viewId !== 'string' || viewId.length === 0) {
            throw new Error(`Capability ${method} missing viewId`);
        }
        return viewId;
    }

    private asRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object') {
            return {};
        }
        return value as Record<string, unknown>;
    }

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