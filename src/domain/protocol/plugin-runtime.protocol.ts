/**
 * 插件运行时协议：
 * 描述插件前端入口模块、命令处理器与命令执行上下文。
 */
import type { PluginHostAPI } from '../api';

export interface CommandExecutionContext {
  api: PluginHostAPI;
}

export type BuiltinCommandHandler = (
  context: CommandExecutionContext,
  ...args: unknown[]
) => Promise<unknown> | unknown;

export interface BuiltinPluginModule {
  readonly pluginId: string;
  commands?: Record<string, BuiltinCommandHandler>;
  activate?: (api: PluginHostAPI) => Promise<void> | void;
  deactivate?: (api: PluginHostAPI) => Promise<void> | void;
}
