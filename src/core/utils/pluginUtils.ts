import { appDataDir, join } from '@tauri-apps/api/path';
import { PluginEntry } from '@/domain/protocol';
import { convertFileSrc } from '@tauri-apps/api/core';

const importByUrl = new Function('url', 'return import(url);') as (url: string) => Promise<{ default?: unknown }>;

/**
 * 将插件声明的资源地址转换为可直接 import 的 URL。
 */
export async function resolvePluginAssetImportUrl(url: string, absolute: boolean = false): Promise<string> {
    if (absolute) {
        return url;
    }
    const appDataPath = await appDataDir();
    const pluginAssetPath = await join(appDataPath, url);
    return convertFileSrc(pluginAssetPath);
}

/**
 * 根据插件资源地址导入模块。
 */
export async function importPluginAssetByUrl(url: string, absolute: boolean = false) {
    const importUrl = await resolvePluginAssetImportUrl(url, absolute);
    return importByUrl(importUrl);
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