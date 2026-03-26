import type { PluginManifest } from '../../domain/protocol/plugin-catalog.protocol';
import service from '../../api/plugin.service';
import { loadPluginModule, registerPluginResources } from '../utils/pluginResourceLoader';

type ExternalPluginManifest = PluginManifest & {
    moduleUrl: string;
    viewUrl?: string;
};

type ExternalManifestIndexEntry =
    | string
    | ExternalPluginManifest
    | {
          manifestUrl: string;
          moduleUrl?: string;
          viewUrl?: string;
      };

const EXTERNAL_MANIFEST_INDEX = '/plugins/manifest.json';

/**
 * 插件资源目录服务（仅外部插件）：
 * 1) 从 public/plugins 目录加载插件清单。
 * 2) 将插件 manifest / commands / view 元数据注册到后端。
 * 3) 校验前端运行时模块与 manifest.id 一致。
 */
export class PluginAssetCatalogService {
    private initialized = false;
    private consistencyValidated = false;
    private externalManifestLoaded = false;
    private readonly manifestsById = new Map<string, PluginManifest>();

    /**
     * 注册全部插件到后端。
     */
    async registerPlugins(): Promise<void> {
        if (this.initialized) return;
        await this.ensureExternalManifestsLoaded();

        for (const manifest of this.manifestsById.values()) {
            await this.registerManifestWithBackend(manifest);
        }

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
                    `Plugin id mismatch: manifest=\"${manifest.id}\", module=\"${module.pluginId}\"`
                );
            }

            if (manifest.view && (!manifest.viewUrl || manifest.viewUrl.trim().length === 0)) {
                throw new Error(`Plugin \"${manifest.id}\" declares view but missing viewUrl`);
            }
        }

        this.consistencyValidated = true;
    }

    /**
     * 获取全部插件 manifest 迭代器。
     */
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

    private async ensureExternalManifestsLoaded(): Promise<void> {
        if (this.externalManifestLoaded) return;
        this.externalManifestLoaded = true;

        try {
            const response = await fetch(EXTERNAL_MANIFEST_INDEX, { cache: 'no-store' });
            if (!response.ok) {
                console.info(`[PluginAssetCatalog] external manifest list not available (${response.status})`);
                return;
            }

            const payload = await response.json();
            if (!Array.isArray(payload)) {
                console.warn('[PluginAssetCatalog] external manifest list must be an array');
                return;
            }

            for (const raw of payload as ExternalManifestIndexEntry[]) {
                try {
                    const manifest = await this.loadManifestFromIndexEntry(raw);
                    if (!this.registerManifest(manifest)) {
                        continue;
                    }
                    registerPluginResources(manifest.id, manifest.moduleUrl, manifest.viewUrl);
                } catch (error) {
                    console.warn('[PluginAssetCatalog] failed to load external plugin manifest', error);
                }
            }
        } catch (error) {
            console.warn('[PluginAssetCatalog] failed to load external plugins', error);
        }
    }

    private async loadManifestFromIndexEntry(raw: ExternalManifestIndexEntry): Promise<ExternalPluginManifest> {
        if (typeof raw === 'string') {
            const manifestUrl = `/plugins/${raw}/plugin.json`;
            return this.fetchManifestByUrl(manifestUrl);
        }

        if (!raw || typeof raw !== 'object') {
            throw new Error('Invalid external plugin manifest entry');
        }

        if ('manifestUrl' in raw) {
            if (typeof raw.manifestUrl !== 'string' || raw.manifestUrl.trim().length === 0) {
                throw new Error('External plugin manifestUrl is required');
            }

            const manifest = await this.fetchManifestByUrl(raw.manifestUrl);
            return {
                ...manifest,
                moduleUrl:
                    typeof raw.moduleUrl === 'string' && raw.moduleUrl.trim().length > 0
                        ? this.resolveAssetUrl(raw.moduleUrl, raw.manifestUrl)
                        : manifest.moduleUrl,
                viewUrl:
                    typeof raw.viewUrl === 'string' && raw.viewUrl.trim().length > 0
                        ? this.resolveAssetUrl(raw.viewUrl, raw.manifestUrl)
                        : manifest.viewUrl,
            };
        }

        return this.normalizeExternalManifest(raw, EXTERNAL_MANIFEST_INDEX);
    }

    private async fetchManifestByUrl(manifestUrl: string): Promise<ExternalPluginManifest> {
        const resolvedManifestUrl = this.resolveAssetUrl(manifestUrl, EXTERNAL_MANIFEST_INDEX);
        const response = await fetch(resolvedManifestUrl, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Failed to fetch plugin manifest: ${manifestUrl} (${response.status})`);
        }

        const payload = await response.json();
        return this.normalizeExternalManifest(payload, resolvedManifestUrl);
    }

    private normalizeExternalManifest(raw: unknown, sourceUrl: string): ExternalPluginManifest {
        if (!raw || typeof raw !== 'object') {
            throw new Error('Invalid external plugin manifest entry');
        }

        const manifest = raw as ExternalPluginManifest;
        if (typeof manifest.id !== 'string' || manifest.id.length === 0) {
            throw new Error('External plugin manifest missing id');
        }

        if (typeof manifest.moduleUrl !== 'string' || manifest.moduleUrl.trim().length === 0) {
            throw new Error(`External plugin manifest \"${manifest.id}\" requires moduleUrl`);
        }

        return {
            ...manifest,
            moduleUrl: this.resolveAssetUrl(manifest.moduleUrl, sourceUrl),
            viewUrl:
                typeof manifest.viewUrl === 'string' && manifest.viewUrl.trim().length > 0
                    ? this.resolveAssetUrl(manifest.viewUrl, sourceUrl)
                    : undefined,
            view: manifest.view
                ? {
                      ...manifest.view,
                  }
                : undefined,
        };
    }

    private resolveAssetUrl(rawUrl: string, baseUrl: string): string {
        try {
            return new URL(rawUrl, new URL(baseUrl, window.location.origin)).toString();
        } catch {
            return rawUrl;
        }
    }

    private registerManifest(manifest: PluginManifest): boolean {
        const pluginId = manifest.id;
        if (this.manifestsById.has(pluginId)) {
            console.warn(`[PluginAssetCatalog] duplicated plugin manifest: ${pluginId}`);
            return false;
        }

        const normalized: PluginManifest = {
            ...manifest,
            view: manifest.view
                ? {
                      ...manifest.view,
                  }
                : undefined,
        };

        this.manifestsById.set(pluginId, normalized);
        return true;
    }

    private async registerManifestWithBackend(manifest: PluginManifest): Promise<void> {
        await service.registerPlugin({
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            activationEvents: manifest.activationEvents ?? [],
            view: manifest.view
                ? {
                      ...manifest.view,
                      pluginId: manifest.id,
                  }
                : undefined,
        });

        for (const command of manifest.commands ?? []) {
            await service.registerCommand({
                ...command,
                pluginId: manifest.id,
            });
        }
    }
}
