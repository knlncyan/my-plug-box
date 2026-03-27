import type { PluginModule } from '../../domain/protocol/plugin-module.protocol';

const moduleUrlByPluginId = new Map<string, string>();
const viewUrlByPluginId = new Map<string, string>();

const importByUrl = new Function('url', 'return import(url);') as (url: string) => Promise<{ default?: unknown }>;

function resolveAbsoluteUrl(rawUrl: string): string {
    try {
        return new URL(rawUrl, window.location.origin).toString();
    } catch {
        return rawUrl;
    }
}

/**
 * 注册插件资源入口。
 */
export function registerPluginResources(pluginId: string, moduleUrl: string, viewUrl?: string): void {
    if (!moduleUrl || moduleUrl.trim().length === 0) {
        throw new Error(`Plugin "${pluginId}" requires moduleUrl`);
    }

    moduleUrlByPluginId.set(pluginId, resolveAbsoluteUrl(moduleUrl));
    if (viewUrl && viewUrl.trim().length > 0) {
        viewUrlByPluginId.set(pluginId, resolveAbsoluteUrl(viewUrl));
    }
}

/**
 * 获取插件运行入口 URL。
 */
export function getPluginModuleUrl(pluginId: string): string | undefined {
    return moduleUrlByPluginId.get(pluginId);
}

/**
 * 获取插件视图入口 URL。
 */
export function getPluginViewUrl(pluginId: string): string | undefined {
    return viewUrlByPluginId.get(pluginId);
}

/**
 * 动态加载插件运行模块。
 */
export async function loadPluginModule(pluginId: string): Promise<PluginModule> {
    const moduleUrl = getPluginModuleUrl(pluginId);
    if (!moduleUrl) {
        throw new Error(`Plugin module url not found: ${pluginId}`);
    }

    const loaded = await importByUrl(moduleUrl);
    if (!loaded?.default) {
        throw new Error(`Plugin module default export missing: ${moduleUrl}`);
    }

    return loaded.default as PluginModule;
}

/**
 * 清空资源索引（用于刷新插件目录）。
 */
export function resetPluginResources(): void {
    moduleUrlByPluginId.clear();
    viewUrlByPluginId.clear();
}