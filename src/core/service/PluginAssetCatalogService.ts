import type { BuiltinPluginManifest } from '../../domain/protocol/plugin-catalog.protocol';
import service from '../../api/plugin.service';
import {
    getBuiltinPluginManifests,
    getPluginModuleLoaderById,
    getPluginViewLoaderById,
    resolvePluginModuleKey,
    resolvePluginViewModuleKey,
} from '../utils/pluginResourceLoader';

/**
 * 插件资源目录服务：
 * 1) 负责加载内置插件 manifest。
 * 2) 负责将 manifest/views/commands 注册到后端。
 * 3) 启动阶段校验 manifest 与模块导出的 pluginId 一致。
 * 4) 不负责命令执行与激活流程。
 */
export class PluginAssetCatalogService {
    private initialized = false;
    private consistencyValidated = false;
    private readonly manifestsById = new Map<string, BuiltinPluginManifest>();

    constructor() {
        for (const manifest of getBuiltinPluginManifests()) {
            const pluginId = manifest.id;
            if (this.manifestsById.has(pluginId)) {
                console.error(`Duplicated plugin id: ${pluginId}`);
                continue;
            }
            this.manifestsById.set(pluginId, manifest);
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

        this.initialized = true;
    }

    /**
     * 启动一致性校验：
     * 1) plugin.json 必须存在对应 index.ts 模块。
     * 2) index.ts 默认导出必须存在 pluginId。
     * 3) 导出的 pluginId 必须与 plugin.json.id 完全一致。
     */
    async validateBuiltinModuleConsistency(): Promise<void> {
        if (this.consistencyValidated) return;

        for (const manifest of this.manifestsById.values()) {
            const moduleKey = resolvePluginModuleKey(manifest.id);
            const loader = getPluginModuleLoaderById(manifest.id);

            if (!loader) {
                throw new Error(`Plugin module not found for manifest "${manifest.id}": ${moduleKey}`);
            }

            const loaded = await loader();
            const module = loaded.default;
            if (!module) {
                throw new Error(`Plugin module default export missing: ${moduleKey}`);
            }

            if (typeof module.pluginId !== 'string' || module.pluginId.length === 0) {
                throw new Error(`Plugin module pluginId missing: ${moduleKey}`);
            }

            if (module.pluginId !== manifest.id) {
                throw new Error(
                    `Plugin id mismatch: manifest="${manifest.id}", module="${module.pluginId}" (${moduleKey})`
                );
            }

            if (manifest.view) {
                const viewModuleKey = resolvePluginViewModuleKey(manifest.id);
                const viewLoader = getPluginViewLoaderById(manifest.id);

                if (!viewLoader) {
                    throw new Error(`Plugin view module not found for manifest "${manifest.id}": ${viewModuleKey}`);
                }

                const loadedView = await viewLoader();
                if (!loadedView.default) {
                    throw new Error(`Plugin view default export missing: ${viewModuleKey}`);
                }
            }
        }

        this.consistencyValidated = true;
    }

    /**
     * 获取全部插件 manifest 迭代器。
     */
    getAllManifests(): IterableIterator<BuiltinPluginManifest> {
        return this.manifestsById.values();
    }
}
