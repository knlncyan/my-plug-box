import type { BuiltinPluginManifest } from '../domain/protocol/plugin-catalog.protocol';
import service from '../api/pluginBackend.service';

/**
 * 插件资源目录服务：
 * 1) 负责加载内置插件 manifest。
 * 2) 负责把 manifest/views/commands 注册到后端。
 * 3) 不负责命令执行与激活流程。
 */
export class PluginAssetCatalogService {
    private initialized = false;
    private readonly manifestsById = new Map<string, BuiltinPluginManifest>();

    constructor() {
        const manifestModules = import.meta.glob(`../plugins/*/plugin.json`, {
            eager: true,
        }) as Record<string, { default: BuiltinPluginManifest }>;

        for (const mod of Object.values(manifestModules)) {
            const pluginId = mod.default.id;
            if (this.manifestsById.has(pluginId)) {
                console.error(`Duplicated plugin id: ${pluginId}`);
                continue;
            }
            this.manifestsById.set(pluginId, mod.default);
        }
    }

    /**
     * 注册全部内置插件元数据到后端。
     */
    async registerBuiltins(): Promise<void> {
        if (this.initialized) return;

        for (const manifest of this.manifestsById.values()) {
            await service.registerPlugin({
                id: manifest.id,
                name: manifest.name,
                version: manifest.version,
                description: manifest.description,
                activationEvents: manifest.activationEvents ?? [],
            });

            for (const view of manifest.views ?? []) {
                await service.registerView({
                    ...view,
                    plugin_id: manifest.id,
                    props: view.props ?? {},
                });
            }

            for (const command of manifest.commands ?? []) {
                await service.registerCommand({
                    ...command,
                    plugin_id: manifest.id,
                });
            }
        }

        this.initialized = true;
    }

    /**
     * 获取全部插件 manifest 迭代器。
     */
    getAllManifests(): IterableIterator<BuiltinPluginManifest> {
        return this.manifestsById.values();
    }
}
