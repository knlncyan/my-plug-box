/**
 * 插件模块协议：
 * 描述插件入口模块、命令处理器和生命周期钩子。
 */

import { CapabilityById } from '../capability';

export interface CommandExecutionContext {
    api: PluginHostAPI;
}

type PluginCommandHandler = (
    context: CommandExecutionContext,
    ...args: unknown[]
) => Promise<unknown> | unknown;

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

export interface PluginModule {
    readonly pluginId: string;
    commands?: Record<string, PluginCommandHandler>;
    activate?: (api: PluginHostAPI) => Promise<void> | void;
    deactivate?: (api: PluginHostAPI) => Promise<void> | void;
}