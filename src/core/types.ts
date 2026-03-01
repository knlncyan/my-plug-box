import type React from 'react';

export interface ViewMeta {
  id: string;                 // 唯一 ID，如 "welcome.main"
  title: string;               // 显示标题
  plugin_id: string;          // 归属插件 ID
  component_path: string;     // 前端组件路径标识 (如 "plugin-id/views/Name")
  props: Record<string, any>; // 传递给组件的初始参数
}

export interface CommandMeta {

}

// ─── Disposable ────────────────────────────────────────────────────────────────
export interface Disposable {
  dispose(): void;
}

// ─── Plugin Manifest ───────────────────────────────────────────────────────────

export interface CommandContribution {
  id: string;
  title: string;
  category?: string;
  keybinding?: string;
}

export interface ViewContribution {
  id: string;
  name: string;
  location: 'sidebar' | 'main' | 'panel';
  icon?: string;
}

export interface MenuContribution {
  context: string;
  command: string;
  group?: string;
  /** Optional condition expression (future use) */
  when?: string;
}

export interface SettingContribution {
  id: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  default: unknown;
  description: string;
  enumValues?: string[];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  /** Entry point path (used for external plugins) */
  main: string;
  /**
   * Events that trigger activation, e.g.:
   *   "onStartup" — activate immediately at app start
   *   "onCommand:myPlugin.foo" — activate when a command is first invoked
   */
  activationEvents: string[];
  contributes: {
    commands?: CommandContribution[];
    views?: ViewContribution[];
    menus?: MenuContribution[];
    settings?: SettingContribution[];
  };
  views?: ViewMeta[];
  commands?: CommandMeta[];
}

// ─── Plugin API (surface exposed to each plugin) ──────────────────────────────

export interface PluginAPI {
  readonly pluginId: string;

  commands: {
    /** Register a command handler. Returns a Disposable to unregister. */
    register(id: string, handler: (...args: unknown[]) => unknown): Disposable;
    /** Execute any registered command by ID. */
    execute(id: string, ...args: unknown[]): Promise<unknown>;
  };

  views: {
    /** Register a React component for a view ID declared in contributes.views. */
    register(id: string, component: React.ComponentType): Disposable;
  };

  menus: {
    /** Dynamically add a menu item to a context (e.g. 'menubar'). */
    addItem(context: string, item: Omit<MenuContribution, 'context'>): Disposable;
  };

  events: {
    /** Subscribe to a named event. Returns a Disposable to unsubscribe. */
    on(event: string, handler: (data: unknown) => void): Disposable;
    /** Publish a named event to all subscribers. */
    emit(event: string, data?: unknown): void;
  };

  settings: {
    /** Get a setting value (namespaced to this plugin). */
    get<T>(key: string): T | undefined;
    /** Set a setting value (namespaced to this plugin). */
    set(key: string, value: unknown): void;
    /** Watch a setting key for changes. */
    onChange(key: string, handler: (value: unknown) => void): Disposable;
  };

  storage: {
    /** Get a persisted value from this plugin's isolated storage. */
    get<T>(key: string): T | undefined;
    /** Persist a value in this plugin's isolated storage. */
    set(key: string, value: unknown): void;
  };
}

// ─── Plugin interface (built-in plugins implement this) ───────────────────────

export interface Plugin {
  activate(api: PluginAPI): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

// ─── Internal registry types ──────────────────────────────────────────────────

export interface RegisteredCommand {
  id: string;
  title: string;
  category?: string;
  keybinding?: string;
  pluginId: string;
  handler: (...args: unknown[]) => unknown;
}

export interface RegisteredView {
  id: string;
  name: string;
  location: 'sidebar' | 'main' | 'panel';
  icon?: string;
  pluginId: string;
  /** Set for built-in plugins (React component) */
  component?: React.ComponentType;
  /** Set for external plugins (iframe URL) */
  iframeUrl?: string;
}

export interface RegisteredMenuItem {
  context: string;
  command: string;
  group?: string;
  when?: string;
  pluginId: string;
}

export interface RegisteredSetting {
  id: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  default: unknown;
  description: string;
  enumValues?: string[];
  pluginId: string;
}

export type PluginStatus =
  | 'registered'
  | 'activating'
  | 'active'
  | 'deactivating'
  | 'inactive'
  | 'error';

export interface PluginEntry {
  manifest: PluginManifest;
  status: PluginStatus;
  error?: string;
  /** Present for built-in plugins */
  module?: Plugin;
  /** Present for external (iframe) plugins */
  bridgeId?: string;
}
