import type { PluginStatus } from './protocol/plugin-catalog.protocol';

/**
 * Rust 侧插件状态事件载荷。
 */
export interface RustPluginStatus {
    id: string;
    status: PluginStatus;
    error?: string;
}