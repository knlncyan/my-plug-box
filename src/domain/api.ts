import type { CapabilityById, CapabilityContract } from './capability';

export interface PluginDisposable {
    dispose(): void;
}

export interface PluginHostAPI {
    readonly pluginId: string;
    /**
     * 通用能力调用入口：
     * - 通过 `method + params` 调用宿主注册的能力处理器。
     * - 适合快速扩展新 API，避免频繁改动固定字段结构。
     */
    capabilities: {
        call<T = unknown>(method: string, params?: unknown): Promise<T>;
        get<K extends string, T extends CapabilityContract = CapabilityById<K>>(id: K): T;
    };
    commands: {
        execute(commandId: string, ...args: unknown[]): Promise<unknown>;
    };
    views: {
        activate(viewId: string): void;
    };
    events: {
        emit(event: string, payload?: unknown): void;
        on(event: string, handler: (payload: unknown) => void): PluginDisposable;
    };
    settings: {
        get<T>(key: string): Promise<T | undefined>;
        set(key: string, value: unknown): Promise<void> | void;
        onChange<T>(key: string, handler: (value: T | undefined) => void): PluginDisposable;
    };
    storage: {
        get<T>(key: string): Promise<T | undefined>;
        set(key: string, value: unknown): Promise<void> | void;
    };
}
