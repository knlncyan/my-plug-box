import { PluginEntry } from '@/domain/protocol';

export const importByUrl = new Function('url', 'return import(url);') as (url: string) => Promise<{ default?: unknown }>;

export function statusOf(plugin: PluginEntry | undefined): string {
    return String(plugin?.status ?? '').trim().toLowerCase();
}

export function isActivated(plugin: PluginEntry | undefined): boolean {
    return statusOf(plugin) === 'activated';
}

export function isDisabled(plugin: PluginEntry | undefined): boolean {
    return statusOf(plugin) === 'disabled';
}

export function activationEventMatches(rule: string, event: string): boolean {
    if (rule === '*') {
        return true;
    }
    if (rule.endsWith('*')) {
        return event.startsWith(rule.slice(0, -1));
    }
    return rule === event;
}