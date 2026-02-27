import type React from 'react';
import type { PluginAPI, PluginManifest, Disposable, MenuContribution } from './types';
import type { CommandRegistry } from './command-registry';
import type { ViewRegistry } from './view-registry';
import type { MenuRegistry } from './menu-registry';
import type { SettingsRegistry } from './settings-registry';
import type { EventBus } from './event-bus';
import { DisposableStore } from './disposable';

export interface PluginRegistries {
  commands: CommandRegistry;
  views: ViewRegistry;
  menus: MenuRegistry;
  settings: SettingsRegistry;
  eventBus: EventBus;
}

const pluginStorageKey = (pluginId: string) => `plug-box:storage:${pluginId}`;

/**
 * Create a sandboxed PluginAPI instance for a plugin.
 *
 * - All registrations are scoped to the plugin's ID.
 * - All registrations are tracked in `store` so they can be cleaned up when
 *   the plugin is deactivated.
 * - Settings are namespaced: plugin calls `get('foo')` but the real key is
 *   `<pluginId>.foo`.
 */
export function createPluginAPI(
  pluginId: string,
  manifest: PluginManifest,
  registries: PluginRegistries,
  store: DisposableStore
): PluginAPI {
  const { commands, views, menus, settings, eventBus } = registries;

  function findCommandMeta(id: string) {
    return manifest.contributes.commands?.find(c => c.id === id);
  }

  function findViewMeta(id: string) {
    return manifest.contributes.views?.find(v => v.id === id);
  }

  return {
    pluginId,

    // ── Commands ────────────────────────────────────────────────────────────
    commands: {
      register(id: string, handler: (...args: unknown[]) => unknown): Disposable {
        const contrib = findCommandMeta(id);
        if (!contrib) {
          console.warn(
            `[${pluginId}] Command "${id}" is not declared in contributes.commands — registering anyway.`
          );
        }
        return store.add(
          commands.register(id, handler, {
            pluginId,
            title: contrib?.title ?? id,
            category: contrib?.category,
            keybinding: contrib?.keybinding,
          })
        );
      },
      execute(id: string, ...args: unknown[]): Promise<unknown> {
        return commands.execute(id, ...args);
      },
    },

    // ── Views ────────────────────────────────────────────────────────────────
    views: {
      register(id: string, component: React.ComponentType): Disposable {
        const contrib = findViewMeta(id);
        if (!contrib) {
          console.warn(
            `[${pluginId}] View "${id}" is not declared in contributes.views — registering anyway.`
          );
        }
        return store.add(
          views.registerComponent(id, component, {
            name: contrib?.name ?? id,
            location: contrib?.location ?? 'main',
            icon: contrib?.icon,
            pluginId,
          })
        );
      },
    },

    // ── Menus ────────────────────────────────────────────────────────────────
    menus: {
      addItem(context: string, item: Omit<MenuContribution, 'context'>): Disposable {
        return store.add(menus.addItem({ context, ...item, pluginId }));
      },
    },

    // ── Events ───────────────────────────────────────────────────────────────
    events: {
      on(event: string, handler: (data: unknown) => void): Disposable {
        return store.add(eventBus.on(event, handler));
      },
      emit(event: string, data?: unknown): void {
        eventBus.emit(event, data);
      },
    },

    // ── Settings ─────────────────────────────────────────────────────────────
    settings: {
      get<T>(key: string): T | undefined {
        return settings.get<T>(`${pluginId}.${key}`);
      },
      set(key: string, value: unknown): void {
        settings.set(`${pluginId}.${key}`, value);
      },
      onChange(key: string, handler: (value: unknown) => void): Disposable {
        return store.add(settings.onChange(`${pluginId}.${key}`, handler));
      },
    },

    // ── Storage ──────────────────────────────────────────────────────────────
    storage: {
      get<T>(key: string): T | undefined {
        try {
          const raw = localStorage.getItem(pluginStorageKey(pluginId));
          const data = JSON.parse(raw ?? '{}') as Record<string, unknown>;
          return data[key] as T | undefined;
        } catch {
          return undefined;
        }
      },
      set(key: string, value: unknown): void {
        try {
          const storageKey = pluginStorageKey(pluginId);
          const data = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, unknown>;
          data[key] = value;
          localStorage.setItem(storageKey, JSON.stringify(data));
        } catch (e) {
          console.error(`[${pluginId}] Storage.set error:`, e);
        }
      },
    },
  };
}
