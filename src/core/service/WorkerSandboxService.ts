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
                const data = payload as { pluginId?: string; key?: string; value?: unknown };
                if (!data?.pluginId || !data?.key) return;

                for (const [subscriptionId, record] of this.settingSubscriptions.entries()) {
                    if (record.pluginId !== data.pluginId || record.key !== data.key) continue;
                    this.emitCapabilitySubscription(data.pluginId, subscriptionId, data.value);
                }
            })
        );
    }

    init(executor: CommandExecutor, activate: (viewId: string) => void): void {
        this.commandExecutor = executor;
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
            execute: async (payload: unknown): Promise<unknown> => {
                if (this.commandExecutor === null) {
                    throw new Error('Command executor not configured');
                }

                const data = payload as { commandId?: string; args?: unknown[]; trace?: string[]; };
                return this.commandExecutor(
                    data.commandId as string,
                    {
                        callerPluginId: pluginId,
                        trace: Array.isArray(data.trace) ? data.trace : [],
                    },
                    ...(Array.isArray(data.args) ? data.args : [])
                );
            },
        }));

        this.deps.capabilityRegistry.register('views', () => ({
            activate: (payload: unknown): null => {
                const data = payload as { viewId?: string };
                if (this.viewActivator && data.viewId) {
                    this.viewActivator(data.viewId);
                }
                return null;
            },
        }));

        this.deps.capabilityRegistry.register('settings', ({ pluginId }) => ({
            get: async <T>(payload: unknown): Promise<T | undefined> => {
                const data = payload as { key?: string };
                return this.deps.pluginSettingService.get(pluginId, data.key as string);
            },
            set: async (payload: unknown): Promise<void> => {
                const data = payload as { key?: string; value?: unknown };
                await this.deps.pluginSettingService.persist(pluginId, data.key as string, data.value);
            },
            subscribe: async (payload: unknown): Promise<string> => {
                const data = payload as { key?: string };
                const subscriptionId = this.nextSubscriptionId('settings');
                this.settingSubscriptions.set(subscriptionId, { pluginId, key: data.key as string });
                return subscriptionId;
            },
            unsubscribe: async (payload: unknown): Promise<null> => {
                const data = payload as { subscriptionId?: string };
                this.settingSubscriptions.delete(data.subscriptionId as string);
                return null;
            },
            onChange: <T>(key: string, handler: (value: T | undefined) => void) => {
                const unsubscribe = this.deps.pluginEventBus.on('setting.changed', (payload) => {
                    const data = payload as { pluginId?: string; key?: string; value?: unknown };
                    if (data.pluginId !== pluginId || data.key !== key) return;
                    handler(data.value as T | undefined);
                });
                return { dispose: unsubscribe };
            },
        }));

        this.deps.capabilityRegistry.register('storage', ({ pluginId }) => ({
            get: async <T>(payload: unknown): Promise<T | undefined> => {
                const data = payload as { key?: string };
                return this.deps.pluginStorageService.get(pluginId, data.key as string);
            },
            set: async (payload: unknown): Promise<void> => {
                const data = payload as { key?: string; value?: unknown };
                await this.deps.pluginStorageService.persist(pluginId, data.key as string, data.value);
            },
        }));

        this.deps.capabilityRegistry.register('events', ({ pluginId }) => ({
            emit: (payload: unknown): null => {
                const data = payload as { event?: string; payload?: unknown };
                const eventName = data.event as string;

                this.deps.pluginEventBus.emit(eventName, data.payload);

                for (const [subscriptionId, record] of this.eventSubscriptions.entries()) {
                    if (record.pluginId !== pluginId || record.eventName !== eventName) continue;
                    this.emitCapabilitySubscription(pluginId, subscriptionId, data.payload);
                }

                return null;
            },
            subscribe: async (payload: unknown): Promise<string> => {
                const data = payload as { event?: string };
                const subscriptionId = this.nextSubscriptionId('events');
                this.eventSubscriptions.set(subscriptionId, { pluginId, eventName: data.event as string });
                return subscriptionId;
            },
            unsubscribe: async (payload: unknown): Promise<null> => {
                const data = payload as { subscriptionId?: string };
                this.eventSubscriptions.delete(data.subscriptionId as string);
                return null;
            },
            on: (eventName: string, handler: (payload: unknown) => void) => {
                const unsubscribe = this.deps.pluginEventBus.on(eventName, handler);
                return { dispose: unsubscribe };
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

    private dispatchHostMethod(context: WorkerMethodContext, method: string, params?: unknown): Promise<unknown> {
        const separatorIndex = method.indexOf('.');
        if (separatorIndex <= 0 || separatorIndex >= method.length - 1) {
            throw new Error(`Unsupported worker method: ${method}`);
        }

        const capabilityId = method.slice(0, separatorIndex);
        const methodName = method.slice(separatorIndex + 1);
        return this.deps.capabilityRegistry.invoke(context.pluginId, capabilityId, methodName, [params ?? {}]);
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
            const data = payload as { method?: string; params?: unknown };
            return this.dispatchHostMethod({ pluginId }, data.method as string, data.params);
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
