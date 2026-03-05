/**
 * 插件状态定义：
 * - 仅保留运行时状态相关类型，避免与 manifest 协议重复定义。
 */
export type PluginStatus =
    | 'registered'
    | 'activating'
    | 'activated'
    | 'deactivating'
    | 'inactive'
    | 'error';

/**
 * Rust 侧插件状态事件载荷。
 */
export interface RustPluginStatus {
    id: string;
    status: PluginStatus;
    error?: string;
}
