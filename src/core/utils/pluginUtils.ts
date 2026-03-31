import { convertFileSrc } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { PluginEntry } from '@/domain/protocol';

const importByUrl = new Function('url', 'return import(url);') as (url: string) => Promise<{ default?: unknown }>;

/**
 * 根据插件资源地址导入模块
 */
export async function importPluginAssetByUrl(url: string) {
    const normalizedUrl = url.replace(/^\/+/, '').replace(/\\/g, '/');
    const appDataPath = await appDataDir();
    const pluginAssetPath = await join(appDataPath, normalizedUrl);
    return importByUrl(convertFileSrc(pluginAssetPath.replace(/\\/g, '/')));
}

/**
 * 获取插件状态，并标准化。
 */
export function statusOf(plugin: PluginEntry | undefined): string {
    return String(plugin?.status ?? '').trim().toLowerCase();
}

export function isActivated(plugin: PluginEntry | undefined): boolean {
    return statusOf(plugin) === 'activated';
}

export function isDisabled(plugin: PluginEntry | undefined): boolean {
    return statusOf(plugin) === 'disabled';
}

/**
 * 校验激活事件是否匹配。
 */
export function activationEventMatches(rule: string, event: string): boolean {
    if (rule === '*') {
        return true;
    }
    if (rule.endsWith('*')) {
        return event.startsWith(rule.slice(0, -1));
    }
    return rule === event;
}
