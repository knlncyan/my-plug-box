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

declare module './capability.ts' {
    interface PluginCapabilityMap {
        commands: CommandsCapability;
        views: ViewsCapability;
        events: EventsCapability;
        settings: SettingsCapability;
        storage: StorageCapability;
    }
}
