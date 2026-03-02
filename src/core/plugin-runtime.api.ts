/**
 * PluginHostAPI registry and runtime-scoped resource management.
 */
import type { PluginDisposable, PluginHostAPI } from './plugin-protocol';

const SETTINGS_STORAGE_KEY = 'plug-box:settings';
const PLUGIN_STORAGE_KEY_PREFIX = 'plug-box:storage:';

type HostEventHandler = (payload: unknown) => void;
type SettingChangeHandler = (value: unknown) => void;

interface HostApiRegistryDeps {
  executeCommand: (
    commandId: string,
    callerPluginId: string,
    ...args: unknown[]
  ) => Promise<unknown>;
  setActiveView: (viewId: string) => void;
}

export class PluginHostApiRegistry {
  private readonly apisByPluginId = new Map<string, PluginHostAPI>();
  private readonly hostEventListeners = new Map<
    string,
    Set<{ pluginId: string; handler: HostEventHandler }>
  >();
  private readonly settingChangeListeners = new Map<
    string,
    Set<{ pluginId: string; handler: SettingChangeHandler }>
  >();
  private readonly pluginDisposables = new Map<string, Set<() => void>>();

  private settingsValues: Record<string, unknown> = this.loadJson<Record<string, unknown>>(
    SETTINGS_STORAGE_KEY,
    {}
  );

  constructor(private readonly deps: HostApiRegistryDeps) {}

  getOrCreate(pluginId: string): PluginHostAPI {
    const existing = this.apisByPluginId.get(pluginId);
    if (existing) return existing;

    const api: PluginHostAPI = {
      pluginId,
      commands: {
        execute: (commandId: string, ...args: unknown[]) =>
          this.deps.executeCommand(commandId, pluginId, ...args),
      },
      views: {
        activate: (viewId: string) => this.deps.setActiveView(viewId),
      },
      events: {
        emit: (event: string, payload?: unknown) => this.emitHostEvent(event, payload),
        on: (event: string, handler: (payload: unknown) => void) =>
          this.addHostEventListener(pluginId, event, handler),
      },
      settings: {
        get: <T>(key: string) => this.getPluginSetting<T>(pluginId, key),
        set: (key: string, value: unknown) => this.setPluginSetting(pluginId, key, value),
        onChange: <T>(key: string, handler: (value: T | undefined) => void) =>
          this.addSettingChangeListener(pluginId, key, handler as SettingChangeHandler),
      },
      storage: {
        get: <T>(key: string) => this.getPluginStorage<T>(pluginId, key),
        set: (key: string, value: unknown) => this.setPluginStorage(pluginId, key, value),
      },
    };

    this.apisByPluginId.set(pluginId, api);
    return api;
  }

  disposePluginResources(pluginId: string): void {
    const disposables = this.pluginDisposables.get(pluginId);
    if (!disposables) return;

    for (const dispose of [...disposables]) {
      try {
        dispose();
      } catch (error) {
        console.error(
          `[plugin-runtime] failed to dispose plugin resource: ${pluginId}`,
          error
        );
      }
    }
    this.pluginDisposables.delete(pluginId);
  }

  private emitHostEvent(event: string, payload: unknown): void {
    const listeners = this.hostEventListeners.get(event);
    if (!listeners) return;

    for (const { handler } of listeners) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[plugin-runtime] host event handler error for "${event}":`, error);
      }
    }
  }

  private addHostEventListener(
    pluginId: string,
    event: string,
    handler: HostEventHandler
  ): PluginDisposable {
    let listeners = this.hostEventListeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.hostEventListeners.set(event, listeners);
    }

    const item = { pluginId, handler };
    listeners.add(item);

    return this.createPluginDisposable(pluginId, () => {
      listeners?.delete(item);
      if (listeners && listeners.size === 0) {
        this.hostEventListeners.delete(event);
      }
    });
  }

  private getPluginSetting<T>(pluginId: string, key: string): T | undefined {
    const scopedKey = this.toPluginSettingKey(pluginId, key);
    return this.settingsValues[scopedKey] as T | undefined;
  }

  private setPluginSetting(pluginId: string, key: string, value: unknown): void {
    const scopedKey = this.toPluginSettingKey(pluginId, key);
    this.settingsValues[scopedKey] = value;
    this.persistJson(SETTINGS_STORAGE_KEY, this.settingsValues);
    this.emitSettingChange(scopedKey, value);
  }

  private addSettingChangeListener(
    pluginId: string,
    key: string,
    handler: SettingChangeHandler
  ): PluginDisposable {
    const scopedKey = this.toPluginSettingKey(pluginId, key);
    let listeners = this.settingChangeListeners.get(scopedKey);
    if (!listeners) {
      listeners = new Set();
      this.settingChangeListeners.set(scopedKey, listeners);
    }

    const item = { pluginId, handler };
    listeners.add(item);

    return this.createPluginDisposable(pluginId, () => {
      listeners?.delete(item);
      if (listeners && listeners.size === 0) {
        this.settingChangeListeners.delete(scopedKey);
      }
    });
  }

  private emitSettingChange(scopedKey: string, value: unknown): void {
    const listeners = this.settingChangeListeners.get(scopedKey);
    if (!listeners) return;

    for (const { handler } of listeners) {
      try {
        handler(value);
      } catch (error) {
        console.error(
          `[plugin-runtime] setting change handler error for "${scopedKey}":`,
          error
        );
      }
    }
  }

  private getPluginStorage<T>(pluginId: string, key: string): T | undefined {
    const record = this.loadJson<Record<string, unknown>>(
      `${PLUGIN_STORAGE_KEY_PREFIX}${pluginId}`,
      {}
    );
    return record[key] as T | undefined;
  }

  private setPluginStorage(pluginId: string, key: string, value: unknown): void {
    const storageKey = `${PLUGIN_STORAGE_KEY_PREFIX}${pluginId}`;
    const record = this.loadJson<Record<string, unknown>>(storageKey, {});
    record[key] = value;
    this.persistJson(storageKey, record);
  }

  private toPluginSettingKey(pluginId: string, key: string): string {
    return `${pluginId}.${key}`;
  }

  private createPluginDisposable(
    pluginId: string,
    teardown: () => void
  ): PluginDisposable {
    let disposables = this.pluginDisposables.get(pluginId);
    if (!disposables) {
      disposables = new Set();
      this.pluginDisposables.set(pluginId, disposables);
    }

    let disposed = false;
    const disposeFn = () => {
      if (disposed) return;
      disposed = true;
      try {
        teardown();
      } finally {
        disposables?.delete(disposeFn);
      }
    };
    disposables.add(disposeFn);

    return { dispose: disposeFn };
  }

  private loadJson<T>(storageKey: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private persistJson(storageKey: string, value: unknown): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (error) {
      console.error(`[plugin-runtime] persist failed: ${storageKey}`, error);
    }
  }
}
