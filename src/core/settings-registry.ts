import type { Disposable, RegisteredSetting } from './types';
import { DisposableStore } from './disposable';
import { EventBus } from './event-bus';

const STORAGE_KEY = 'plug-box:settings';

export class SettingsRegistry {
  private readonly _schema = new Map<string, RegisteredSetting>();
  private _values: Record<string, unknown>;
  private readonly _bus = new EventBus();

  constructor() {
    try {
      this._values = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    } catch {
      this._values = {};
    }
  }

  /**
   * Declare a setting's schema (type, default, description).
   * Called by the plugin manager when processing manifest contributions.
   */
  registerSchema(setting: RegisteredSetting): Disposable {
    this._schema.set(setting.id, setting);
    // Seed default value if not already persisted
    if (!(setting.id in this._values)) {
      this._values[setting.id] = setting.default;
    }
    return DisposableStore.from(() => this._schema.delete(setting.id));
  }

  get<T>(key: string): T | undefined {
    if (key in this._values) return this._values[key] as T;
    return this._schema.get(key)?.default as T | undefined;
  }

  set(key: string, value: unknown): void {
    this._values[key] = value;
    this._persist();
    this._bus.emit(`change:${key}`, value);
  }

  onChange(key: string, handler: (value: unknown) => void): Disposable {
    return this._bus.on(`change:${key}`, handler);
  }

  /** Return all declared setting schemas (used by a settings UI plugin). */
  getSchema(): RegisteredSetting[] {
    return Array.from(this._schema.values());
  }

  private _persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._values));
    } catch (e) {
      console.error('[SettingsRegistry] Failed to persist settings:', e);
    }
  }
}
