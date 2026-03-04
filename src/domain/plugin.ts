import type { BuiltinPluginManifest } from './protocol/plugin-catalog.protocol';

/**
 * 插件 manifest 类型别名：
 * 统一复用协议层定义，避免与 protocol 重复维护。
 */
export type PluginManifest = BuiltinPluginManifest;
export type PluginManifestJSON = BuiltinPluginManifest;

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
