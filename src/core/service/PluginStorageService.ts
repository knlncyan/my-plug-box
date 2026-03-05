import service from '../../api/plugin.service';

/**
 * 插件存储服务：
 * 1) 插件数据为私有数据，最终由 Rust 端按插件分文件持久化。
 * 2) 提供快照读取与键值写入能力。
 */
export class PluginStorageService {
    async getSnapshot<T>(pluginId: string): Promise<T> {
        const snapshot = await service.getPluginStorageSnapshot(pluginId);
        // 返回副本，避免调用方直接篡改底层对象。
        return { ...snapshot } as T;
    }

    /**
     * 读取单个键值。
     */
    async get<T>(pluginId: string, key: string): Promise<T | undefined> {
        const snapshot = await this.getSnapshot<Record<string, unknown>>(pluginId);
        return snapshot[key] as T | undefined;
    }

    async persist(pluginId: string, key: string, value: unknown): Promise<void> {
        await service.setPluginStorageValue(pluginId, key, value);
    }
}
