/**
 * 插件基础资源管理器。
 * 该目录层仅负责静态 manifest 的加载和后端注册，不处理命令执行。
 */
import type { BuiltinPluginManifest, BuiltinPluginModule } from './pluginRuntime.protocol';
import service from './pluginBackend.service';

export class PluginRuntimeAssets {
    private initialized = false;
    private readonly manifestsById = new Map<string, BuiltinPluginManifest>();
    private readonly pluginEntryById = new Map<string, BuiltinPluginModule>();

    // 构造器根据传入的路径解析相关静态资源
    constructor() {
        const manifestModules = import.meta.glob(`../plugins/*/plugin.json`,
            { eager: true }
        ) as Record<string, { default: BuiltinPluginManifest }>;

        for (const mod of Object.values(manifestModules)) {
            const pluginId = mod.default.id;
            if (this.manifestsById.has(pluginId)) {
                console.error(`Duplicated plugin id: ${pluginId}`);
                continue;
            }
            this.manifestsById.set(pluginId, mod.default);
        }

        const pluginEntryModules = import.meta.glob(`../plugins/*/index.ts`,
            { eager: true }
        ) as Record<string, { default: BuiltinPluginModule }>;
        for (const mod of Object.values(pluginEntryModules)) {
            const pluginId = mod.default.pluginId;
            if (this.manifestsById.has(pluginId)) {
                console.error(`Duplicated plugin id: ${pluginId}`);
                continue;
            }
            this.pluginEntryById.set(pluginId, mod.default);
        }
    }

    /**
    * 注册所有内置插件 manifest 到后端。
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
    * 按 pluginId 读取 manifest。
    */
    getManifest(pluginId: string): BuiltinPluginManifest | undefined {
        return this.manifestsById.get(pluginId);
    }

    /**
    * 获取全部 manifest 的迭代器。
    */
    getAllManifests(): IterableIterator<BuiltinPluginManifest> {
        return this.manifestsById.values();
    }
}

