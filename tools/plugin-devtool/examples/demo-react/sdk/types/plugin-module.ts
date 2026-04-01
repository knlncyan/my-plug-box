/**
 * 插件模块协议：
 * 描述插件入口模块、命令处理器和生命周期钩子。
 */
import type { PluginHostAPI } from './api';

export interface CommandExecutionContext {
    api: PluginHostAPI;
}

export type PluginCommandHandler = (
    context: CommandExecutionContext,
    ...args: unknown[]
) => Promise<unknown> | unknown;

export interface PluginModule {
    readonly pluginId: string;
    commands?: Record<string, PluginCommandHandler>;
    activate?: (api: PluginHostAPI) => Promise<void> | void;
    deactivate?: (api: PluginHostAPI) => Promise<void> | void;
}