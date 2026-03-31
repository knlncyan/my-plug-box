/**
 * 插件目录与后端接口协议（统一定义）：
 * 1) 统一后端响应包络类型。
 * 2) 统一插件列表、命令、插件清单结构。
 */
export type ApiCode = 'SUCCESS' | 'WARNING' | 'ERROR';

export interface ApiResponse<T = unknown> {
    success: boolean;
    code: ApiCode;
    message: string;
    data: T | null;
}

export type PluginStatus =
    | 'registered'
    | 'activating'
    | 'activated'
    | 'deactivating'
    | 'inactive'
    | 'disabled'
    | 'error';

export type ShortcutScope = 'local' | 'global';

export interface ViewMeta {
    id: string;
    title: string;
    pluginId: string;
    props: Record<string, unknown>;
}

export interface CommandMeta {
    id: string;
    description: string;
    pluginId: string;
    shortcut?: string;
    shortcutScope?: ShortcutScope;
}

export interface PluginCommandManifest {
    id: string;
    description: string;
    shortcut?: string;
    shortcutScope?: ShortcutScope;
}

export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    icon?: string;
    description?: string;
    activationEvents?: string[];
}

export interface PluginEntry {
    pluginId: string,
    manifest: PluginManifest,
    viewMeta?: ViewMeta,
    commandsMeta: CommandMeta[],
    status: PluginStatus,
    moduleUrl: string;
    viewUrl: string;
}
