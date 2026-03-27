/**
 * 插件视图与宿主运行时通信协议（Window RPC）。
 */
export interface PluginViewInvokeHostMethodPayload {
    method: string;
    params?: unknown;
}

/**
 * 插件视图在 iframe 中捕获到的键盘事件快照。
 * 事件匹配只依赖 code，确保与宿主快捷键判定完全一致。
 */
export interface PluginViewLocalShortcutKeydownPayload {
    code: string;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    repeat: boolean;
    isComposing: boolean;
    defaultPrevented: boolean;
    targetIsEditable: boolean;
}
