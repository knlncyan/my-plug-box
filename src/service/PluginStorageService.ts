// PluginStorageService.ts
import service from '../api/pluginBackend.service';

/**
 * 插件存储服务：
 * 1) 插件数据是私有数据，最终由 Rust 端按插件分文件持久化。
 * 2) Worker 内部可维护内存副本，这里提供快照读取与写入落盘能力。
 */
export class PluginStorageService {
    async getSnapshot<T>(pluginId: string): Promise<T> {
        const snapshot = await service.getPluginStorageSnapshot(pluginId);
        return { ...snapshot } as T; // 返回副本，避免外部直接修改缓存对象
    }

    /**
     * 读取单个键值（宿主兼容接口）。
     */
    async get<T>(pluginId: string, key: string): Promise<T | undefined> {
        const snapshot = await this.getSnapshot<Record<string, unknown>>(pluginId);
        return snapshot[key] as T | undefined;
    }

    async persist(pluginId: string, key: string, value: unknown): Promise<void> {
        await service.setPluginStorageValue(pluginId, key, value);
    }
}
