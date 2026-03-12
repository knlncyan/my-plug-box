import service from '../../api/plugin.service';
import { PluginEventBus } from '../PluginEventBus';

/**
 * 插件设置服务：
 * 1) 以平面键值维护全局与插件设置（如 global.theme、builtin.xxx.verbose）。
 * 2) 提供插件作用域读取与持久化写入。
 */
export class PluginSettingService {
    private setting: Record<string, unknown> = {};
    private loadPromise: Promise<void> | null = null;

    constructor(private readonly pluginEventBus: PluginEventBus) { }

    private ensureLoaded(): Promise<void> {
        if (!this.loadPromise) {
            this.loadPromise = this.loadAll();
        }
        return this.loadPromise;
    }

    private async loadAll(): Promise<void> {
        this.setting = (await service.getAllPluginSettings()).data ?? {};
    }

    /**
     * 返回当前插件可见设置快照：global.* + {pluginId}.*。
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
     * 持久化单个设置
     */
    async persist(pluginId: string, key: string, value: unknown): Promise<void> {
        await this.ensureLoaded();
        const scopedKey = `${pluginId}.${key}`;
        this.setting[scopedKey] = value;

        try {
            await service.setPluginSetting(pluginId, key, value);
        } catch (error) {
            console.error(`[PluginSetting] Failed to persist ${scopedKey}`, error);
        }

        this.pluginEventBus.emit('setting.changed', { pluginId, key, value });
    }
}
