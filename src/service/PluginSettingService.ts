import service from '../api/pluginBackend.service';
import { PluginEventBus } from '../core/PluginEventBus';

/**
 * 设置服务，设置采用全局存储
 */
export class PluginSettingService {
    private setting: Record<string, unknown> = {};
    private loadPromise: Promise<void> | null = null;

    constructor(private readonly pluginEventBus: PluginEventBus) { }

    private ensureLoaded(): Promise<void> {
        if (!this.loadPromise) {
            this.loadPromise = this._load();
        }
        return this.loadPromise;
    }

    private async _load(): Promise<void> {
        this.setting = await service.getAllPluginSettings();
    }

    /**
     * 返回全局设置和插件设置
     */
    async getSnapshot(pluginId: string): Promise<Record<string, unknown>> {
        await this.ensureLoaded();
        const result: Record<string, unknown> = {};
        const globalPrefix = 'global.';
        const pluginPrefix = `${pluginId}.`;
        for (const key in this.setting) {
            if (key.startsWith(globalPrefix) || key.startsWith(pluginPrefix)) {
                result[key] = this.setting[key];
            }
        }

        return result;
    }

    async get<T>(pluginId: string, key: string): Promise<T | undefined> {
        await this.ensureLoaded();
        const scopedKey = `${pluginId}.${key}`;
        const globalKey = `global.${key}`;
        if (scopedKey in this.setting) {
            return this.setting[scopedKey] as T | undefined;
        }
        return this.setting[globalKey] as T | undefined;
    }

    /**
     * 兼容命名：set 是 persist 的语义别名，方便上层 API 直接调用。
     */
    async set(pluginId: string, key: string, value: unknown): Promise<void> {
        await this.persist(pluginId, key, value);
    }

    async persist(pluginId: string, key: string, value: unknown): Promise<void> {
        await this.ensureLoaded();
        const scopedKey = `${pluginId}.${key}`;
        this.setting[scopedKey] = value;

        try {
            await service.setPluginSetting(pluginId, key, value);
        } catch (error) {
            console.error(`[PluginSetting] Failed to persist ${scopedKey}`, error);
        }

        this.pluginEventBus.emit("setting.changed", { pluginId, key, value });
    }
}
