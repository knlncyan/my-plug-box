import type { CommandMeta, PluginEntry } from '../../domain/protocol/plugin-catalog.protocol';
import service from '../../api/plugin.service';

/**
 * 插件资源目录服务（仅外部插件）：
 * 1) 通过后端刷新接口获取插件清单。
 */
export class PluginRuntimeCatalogService {
    private initialized = false;
    private externalManifestLoaded = false;

    private readonly pluginEntryById = new Map<string, PluginEntry>();
    private readonly commandById = new Map<string, CommandMeta>();

    /**
     * 注册全部插件到运行时（后端已经完成扫描与注册，这里只保证加载一次）。
     */
    async initLoadPlugins(): Promise<void> {
        if (this.initialized) return;
        await this.ensureExternalManifestsLoaded(true);
        this.initialized = true;
    }

    async getAllPluginEntry(refresh: boolean = false): Promise<PluginEntry[]> {
        if (refresh) {
            await this.refreshFromBackend(false);
        }
        return Array.from(this.pluginEntryById.values());
    }

    getPluginEntryById(pluginId: string): PluginEntry | undefined {
        return this.pluginEntryById.get(pluginId);
    }

    getCommandById(commandId: string): CommandMeta | undefined {
        return this.commandById.get(commandId);
    }

    /**
     * 从后端获取插件运行列表。
     * @param reload 表示是否重新加载插件，不加载则只获取当前列表
     */
    async refreshFromBackend(reload: boolean): Promise<void> {
        this.externalManifestLoaded = false;
        this.pluginEntryById.clear();
        this.commandById.clear();
        await this.ensureExternalManifestsLoaded(reload);
    }

    private async ensureExternalManifestsLoaded(reload: boolean = false): Promise<void> {
        if (this.externalManifestLoaded) return;
        this.externalManifestLoaded = true;

        const response = reload ? await service.refreshExternalPlugins() : await service.getPluginsRuntime();
        const payload = response.data;
        if (!Array.isArray(payload)) {
            console.warn('[PluginRuntimeCatalog] backend plugin index must be an array');
            return;
        }
        for (const raw of payload) {
            try {
                if (!raw || typeof raw !== 'object') {
                    throw new Error('Invalid plugin manifest entry');
                }
                if (typeof raw.pluginId !== 'string' || raw.pluginId.length === 0) {
                    throw new Error('Plugin manifest missing id');
                }
                if (!this.pluginEntryById.has(raw.pluginId)) {
                    this.pluginEntryById.set(raw.pluginId, raw);
                    raw.commandsMeta.forEach(it => this.commandById.set(it.id, it));
                }
            } catch (error) {
                console.warn('[PluginRuntimeCatalog] failed to process plugin manifest', error);
            }
        }
    }
}

