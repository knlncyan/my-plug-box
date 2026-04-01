import type { CapabilityById } from './capability';

export interface PluginDisposable {
    dispose(): void;
}

export interface CommandsCapability {
    execute(commandId: string, ...args: unknown[]): Promise<unknown>;
}

export interface ViewsCapability {
    activate(viewId: string): void;
}

export interface EventsCapability {
    emit(event: string, payload?: unknown): void;
    on(event: string, handler: (payload: unknown) => void): PluginDisposable;
}

export interface SettingsCapability {
    get<T>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
    onChange<T>(key: string, handler: (value: T | undefined) => void): PluginDisposable;
}

export interface StorageCapability {
    get<T>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
}

declare module './capability' {
    interface PluginCapabilityMap {
        commands: CommandsCapability;
        views: ViewsCapability;
        events: EventsCapability;
        settings: SettingsCapability;
        storage: StorageCapability;
    }
}

export interface PluginHostAPI {
    readonly pluginId: string;
    /**
     * 通用能力调用入口：
     * - call: method + params 方式，适合轻量扩展。
     * - get: 类型化能力访问，适合长期维护和 IDE 提示。
     */
    call<T = unknown>(method: string, params?: unknown): Promise<T>;
    get<K extends string>(id: K): CapabilityById<K>;
}
