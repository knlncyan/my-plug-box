/**
 * 插件视图与宿主运行时通信协议（Window RPC）。
 */
export interface PluginViewInvokeHostMethodPayload {
    method: string;
    params?: unknown;
}