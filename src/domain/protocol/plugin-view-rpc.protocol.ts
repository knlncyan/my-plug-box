/**
 * 插件视图与宿主运行时通信协议（Window RPC）。
 */
import type { ExecuteCommandOptions } from '../runtime';

export interface PluginViewExecuteCommandPayload {
    commandId: string;
    args?: unknown[];
    options?: ExecuteCommandOptions;
}

export interface PluginViewSetActiveViewPayload {
    viewId: string | null;
}

export interface PluginViewInvokeHostMethodPayload {
    method: string;
    params?: unknown;
}