import type { CommandMeta, PluginSummary } from './protocol/plugin-catalog.protocol';

/**
 * 命令执行可选参数：
 * - `activateView` 允许在命令返回视图 ID 时切换到该视图。
 */
export interface ExecuteCommandOptions {
    activateView?: (pluginId: string) => void;
}

/**
 * 命令执行链路内部参数：
 * - `trace` 用于命令调用链路防循环。
 * - `callerPluginId` 保留调用方插件上下文（便于后续审计/权限扩展）。
 */
export interface ExecuteCommandPipelineOptions extends ExecuteCommandOptions {
    callerPluginId?: string;
    trace?: string[];
}

/**
 * 前端运行时快照：
 * - 提供主界面与插件视图沙箱同步状态使用。
 */
export interface PluginRuntimeSnapshot {
    loading: boolean;
    ready: boolean;
    error: string | null;
    activeViewPluginId: string | null;
    plugins: PluginSummary[];
    commands: CommandMeta[];
}
