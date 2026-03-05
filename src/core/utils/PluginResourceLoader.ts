import type { ComponentType } from 'react';
import type { BuiltinPluginManifest } from '../../domain/protocol/plugin-catalog.protocol';
import type { BuiltinPluginModule } from '../../domain/protocol/plugin-runtime.protocol';

type PluginModuleLoader = () => Promise<{ default?: BuiltinPluginModule }>;
type PluginViewLoader = () => Promise<{ default?: ComponentType<Record<string, unknown>> }>;

/**
 * 插件资源统一导入入口：
 * 1) 集中声明 import.meta.glob，避免资源导入分散。
 * 2) 统一维护 key 解析规则，避免目录迁移导致 key 不一致。
 */
const manifestModules = import.meta.glob('../../plugins/*/plugin.json', {
    eager: true,
}) as Record<string, { default: BuiltinPluginManifest }>;

const pluginModuleLoaders = import.meta.glob('../../plugins/*/index.ts') as Record<string, PluginModuleLoader>;

const pluginViewLoaders = import.meta.glob('../../plugins/**/views/*View.tsx') as Record<string, PluginViewLoader>;

/**
 * 获取全部内置插件 manifest 列表。
 */
export function getBuiltinPluginManifests(): BuiltinPluginManifest[] {
    return Object.values(manifestModules).map((mod) => mod.default);
}

/**
 * 根据 pluginId 解析插件入口模块 key。
 */
export function resolvePluginModuleKey(pluginId: string): string {
    const folder = pluginId.replace(/^builtin\./, '');
    return `../../plugins/${folder}/index.ts`;
}

/**
 * 根据 pluginId 获取插件入口模块 loader。
 */
export function getPluginModuleLoaderById(pluginId: string): PluginModuleLoader | undefined {
    return pluginModuleLoaders[resolvePluginModuleKey(pluginId)];
}

/**
 * 根据 component_path 解析插件视图模块 key。
 */
export function resolvePluginViewModuleKey(componentPath: string): string {
    const normalized = componentPath.replace(/\\/g, '/').replace(/^builtin\./, '');
    return `../../plugins/${normalized}.tsx`;
}

/**
 * 根据 component_path 获取插件视图 loader。
 */
export function getPluginViewLoaderByPath(componentPath: string): PluginViewLoader | undefined {
    return pluginViewLoaders[resolvePluginViewModuleKey(componentPath)];
}
