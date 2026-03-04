/**
 * 插件 API 注册中心。
 * 负责为每个插件提供隔离作用域的宿主能力（命令/视图/事件/设置/存储）。
 */
import { PluginSettingService } from '../service/PluginSettingService';
import { PluginStorageService } from '../service/PluginStorageService';
import { PluginEventBus } from './PluginEventBus';
import { PluginEvents } from '../domain/event';
import { PluginHostAPI } from '../domain/api';
import type { CapabilityContract } from '../domain/capability';
import { CapabilityRegistry } from './CapabilityRegistry';
import { PluginDisposable } from './PluginDisposable';
import { PluginCommandService } from '../service/PluginCommandService';
import { PluginViewService } from '../service/PluginViewService';

interface PluginApiRegistryDeps {
    capabilityRegistry: CapabilityRegistry;
    pluginCommandService: PluginCommandService;
    pluginViewService: PluginViewService;
    pluginSettingService: PluginSettingService;
    pluginStorageService: PluginStorageService;
    pluginEventBus: PluginEventBus;
    pluginDisposable: PluginDisposable;
}

export class PluginApiRegistry {
    private readonly apisByPluginId = new Map<string, PluginHostAPI>();

    /**
     * 注入宿主能力依赖（命令执行、视图激活、设置/存储持久化等）。
     */
    constructor(private readonly deps: PluginApiRegistryDeps) { }

    getOrCreate(pluginId: string): PluginHostAPI {
        const existing = this.apisByPluginId.get(pluginId);
        if (existing) return existing;

        const api: PluginHostAPI = {
            pluginId,
            capabilities: {
                call: async <T = unknown>(method: string, params?: unknown): Promise<T> =>
                    (await this.dispatchCapabilityCall(pluginId, method, params)) as T,
                get: <K extends string, T extends CapabilityContract>(capabilityId: K): T =>
                    this.deps.capabilityRegistry.resolve(pluginId, capabilityId) as T,
            },
            commands: {
                execute: (commandId: string, ...args: unknown[]) =>
                    this.deps.pluginCommandService.executeCommand(
                        commandId,
                        { callerPluginId: pluginId, trace: [] },
                        ...args
                    ),
            },
            views: {
                activate: (viewId: string) => {
                    this.deps.pluginViewService.setActiveView(viewId);
                },
            },
            events: {
                emit: <K extends keyof PluginEvents>(event: K, payload: PluginEvents[K]) =>
                    this.deps.pluginEventBus.emit(event, payload),
                on: <K extends keyof PluginEvents>(event: K, handler: (payload: PluginEvents[K]) => void) => {
                    const dispose = this.deps.pluginEventBus.on(event, handler);
                    this.deps.pluginDisposable.add(pluginId, dispose);
                    return { dispose };
                },
            },
            settings: {
                get: <T>(key: string) => this.deps.pluginSettingService.get<T>(pluginId, key),
                set: async (key: string, value: unknown) => this.deps.pluginSettingService.persist(pluginId, key, value),
                onChange: <T>(key: string, handler: (value: T | undefined) => void) => {
                    const dispose = this.deps.pluginEventBus.on('setting.changed', (payload) => {
                        if (!payload || typeof payload !== 'object') return;
                        const data = payload as { pluginId?: unknown; key?: unknown; value?: unknown };
                        if (data.pluginId !== pluginId) return;
                        if (data.key !== key) return;
                        handler(data.value as T | undefined);
                    });
                    this.deps.pluginDisposable.add(pluginId, dispose);
                    return { dispose };
                },
            },
            storage: {
                get: <T>(key: string) => this.deps.pluginStorageService.get<T>(pluginId, key),
                set: async (key: string, value: unknown) => this.deps.pluginStorageService.persist(pluginId, key, value),
            },
        };

        this.apisByPluginId.set(pluginId, api);
        return api;
    }

    private async dispatchCapabilityCall(
        pluginId: string,
        method: string,
        params?: unknown
    ): Promise<unknown> {
        const payload = this.asRecord(params);

        switch (method) {
            case 'command.execute': {
                const commandId = payload.commandId;
                const args = payload.args;
                if (typeof commandId !== 'string' || commandId.length === 0) {
                    throw new Error('Capability command.execute missing commandId');
                }
                if (!Array.isArray(args)) {
                    throw new Error('Capability command.execute invalid args');
                }
                return this.deps.pluginCommandService.executeCommand(
                    commandId,
                    { callerPluginId: pluginId, trace: [] },
                    ...args
                );
            }
            case 'view.activate': {
                const viewId = payload.viewId;
                if (typeof viewId !== 'string' || viewId.length === 0) {
                    throw new Error('Capability view.activate missing viewId');
                }
                this.deps.pluginViewService.setActiveView(viewId);
                return null;
            }
            case 'settings.set': {
                const key = payload.key;
                if (typeof key !== 'string' || key.length === 0) {
                    throw new Error('Capability settings.set missing key');
                }
                await this.deps.pluginSettingService.persist(pluginId, key, payload.value);
                return null;
            }
            case 'storage.set': {
                const key = payload.key;
                if (typeof key !== 'string' || key.length === 0) {
                    throw new Error('Capability storage.set missing key');
                }
                await this.deps.pluginStorageService.persist(pluginId, key, payload.value);
                return null;
            }
            case 'event.emit': {
                const eventName = payload.event;
                if (typeof eventName !== 'string' || eventName.length === 0) {
                    throw new Error('Capability event.emit missing event');
                }
                this.deps.pluginEventBus.emit(eventName, payload.payload);
                return null;
            }
            case 'capability.invoke': {
                const capabilityId = payload.capabilityId;
                const methodName = payload.method;
                const args = payload.args;
                if (typeof capabilityId !== 'string' || capabilityId.length === 0) {
                    throw new Error('Capability capability.invoke missing capabilityId');
                }
                if (typeof methodName !== 'string' || methodName.length === 0) {
                    throw new Error('Capability capability.invoke missing method');
                }
                if (!Array.isArray(args)) {
                    throw new Error('Capability capability.invoke invalid args');
                }
                return this.deps.capabilityRegistry.invoke(pluginId, capabilityId, methodName, args);
            }
            default:
                throw new Error(`Unsupported capability method: ${method}`);
        }
    }

    private asRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object') {
            return {};
        }
        return value as Record<string, unknown>;
    }
}
