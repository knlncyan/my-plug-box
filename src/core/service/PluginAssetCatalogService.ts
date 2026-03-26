import type { PluginManifest } from '../../domain/protocol/plugin-catalog.protocol';
import service from '../../api/plugin.service';
import { loadPluginModule, registerPluginResources, resetPluginResources } from '../utils/pluginResourceLoader';

/**
 * 插件资源目录服务（仅外部插件）：
 * 1) 通过后端刷新接口获取插件清单。
 * 2) 将 moduleUrl / viewUrl 注册到前端资源加载器。
 * 3) 提供启动一致性校验（manifest 与模块导出一致）。
 */
export class PluginAssetCatalogService {
    private initialized = false;
    private consistencyValidated = false;
    private externalManifestLoaded = false;
    private readonly manifestsById = new Map<string, PluginManifest>();

    /**
     * 注册全部插件到运行时（后端已经完成扫描与注册，这里只保证加载一次）。
     */
    async registerPlugins(): Promise<void> {
        if (this.initialized) return;
        await this.ensureExternalManifestsLoaded();
        this.initialized = true;
    }

    /**
     * 启动一致性校验：
     * 1) moduleUrl 对应模块必须可加载。
     * 2) 模块导出的 pluginId 必须与 manifest.id 一致。
     * 3) 若声明 view，则必须提供 viewUrl。
     */
    async validateManifestConsistency(): Promise<void> {
        await this.ensureExternalManifestsLoaded();
        if (this.consistencyValidated) return;

        for (const manifest of this.manifestsById.values()) {
            const module = await loadPluginModule(manifest.id);

            if (typeof module.pluginId !== 'string' || module.pluginId.length === 0) {
                throw new Error(`Plugin module pluginId missing: ${manifest.id}`);
            }

            if (module.pluginId !== manifest.id) {
                throw new Error(
                    `Plugin id mismatch: manifest="${manifest.id}", module="${module.pluginId}"`
                );
            }

            if (manifest.view && (!manifest.viewUrl || manifest.viewUrl.trim().length === 0)) {
                throw new Error(`Plugin "${manifest.id}" declares view but missing viewUrl`);
            }
        }

        this.consistencyValidated = true;
    }

    getAllManifests(): IterableIterator<PluginManifest> {
        return this.manifestsById.values();
    }

    getManifestById(pluginId: string): PluginManifest | undefined {
        return this.manifestsById.get(pluginId);
    }

    getManifestByViewId(viewId: string): PluginManifest | undefined {
        for (const manifest of this.manifestsById.values()) {
            if (manifest.view?.id === viewId) {
                return manifest;
            }
        }
        return undefined;
    }

    /**
     * 由后端维护索引：前端只请求刷新结果，不再直接读取 manifest.json。
     */
    async refreshFromBackend(): Promise<void> {
        this.externalManifestLoaded = false;
        this.manifestsById.clear();
        resetPluginResources();
        this.initialized = false;
        this.consistencyValidated = false;
        await this.ensureExternalManifestsLoaded();
    }

    private async ensureExternalManifestsLoaded(): Promise<void> {
        if (this.externalManifestLoaded) return;
        this.externalManifestLoaded = true;

        const response = await service.refreshExternalPlugins();
        const payload = response.data;
        if (!Array.isArray(payload)) {
            console.warn('[PluginAssetCatalog] backend plugin index must be an array');
            return;
        }

        for (const raw of payload) {
            try {
                const manifest = this.normalizeManifest(raw);
                if (!this.registerManifest(manifest)) {
                    continue;
                }
                if (manifest.moduleUrl) {
                    registerPluginResources(manifest.id, manifest.moduleUrl, manifest.viewUrl);
                }
            } catch (error) {
                console.warn('[PluginAssetCatalog] failed to process plugin manifest', error);
            }
        }
    }

    private normalizeManifest(raw: unknown): PluginManifest {
        if (!raw || typeof raw !== 'object') {
            throw new Error('Invalid plugin manifest entry');
        }

        const manifest = raw as PluginManifest;
        if (typeof manifest.id !== 'string' || manifest.id.length === 0) {
            throw new Error('Plugin manifest missing id');
        }

        return {
            ...manifest,
            view: manifest.view
                ? {
                      ...manifest.view,
                  }
                : undefined,
            commands: Array.isArray(manifest.commands)
                ? manifest.commands.map((cmd) => ({ ...cmd }))
                : [],
        };
    }

    private registerManifest(manifest: PluginManifest): boolean {
        const pluginId = manifest.id;
        if (this.manifestsById.has(pluginId)) {
            console.warn(`[PluginAssetCatalog] duplicated plugin manifest: ${pluginId}`);
            return false;
        }

        this.manifestsById.set(pluginId, manifest);
        return true;
    }
}

