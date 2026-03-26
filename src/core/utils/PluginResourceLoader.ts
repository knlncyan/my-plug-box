import type { PluginModule } from '../../domain/protocol/plugin-runtime.protocol';

const moduleUrlByPluginId = new Map<string, string>();
const viewUrlByPluginId = new Map<string, string>();
const importByUrl = new Function(
    'url',
    'return import(url);'
) as (url: string) => Promise<{ default?: unknown }>;

function resolveAbsoluteUrl(rawUrl: string): string {
    try {
        return new URL(rawUrl, window.location.origin).toString();
    } catch {
        return rawUrl;
    }
}

/**
 * 统一注册插件资源入口（仅外部插件）。
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
 * 获取插件运行时入口 URL。
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
 * 直接按 URL 加载插件运行时模块。
 */
export async function loadPluginModule(pluginId: string): Promise<PluginModule> {
    const moduleUrl = getPluginModuleUrl(pluginId);
    if (!moduleUrl) {
        throw new Error(`Plugin module url not found: ${pluginId}`);
    }

    // 通过 Function 包裹 dynamic import，避免 Vite 将 public 目录 URL 当源码模块处理。
    const loaded = await importByUrl(moduleUrl);
    if (!loaded?.default) {
        throw new Error(`Plugin module default export missing: ${moduleUrl}`);
    }

    return loaded.default as PluginModule;
}

/**
 * 清空已注册的插件资源入口（用于刷新索引）。
 */
export function resetPluginResources(): void {
    moduleUrlByPluginId.clear();
    viewUrlByPluginId.clear();
}

