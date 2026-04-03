import { CapabilityById } from './capability';

export interface CommandExecutionContext {
    api: PluginHostAPI;
}

type PluginCommandHandler = (
    context: CommandExecutionContext,
    ...args: unknown[]
) => Promise<unknown> | unknown;

export interface PluginHostAPI {
    readonly pluginId: string;
    
    call<T = unknown>(method: string, params?: unknown): Promise<T>;
    get<K extends string>(id: K): CapabilityById<K>;
}

export interface PluginModule {
    readonly pluginId: string;
    commands?: Record<string, PluginCommandHandler>;
    activate?: (api: PluginHostAPI) => Promise<void> | void;
    deactivate?: (api: PluginHostAPI) => Promise<void> | void;
}
