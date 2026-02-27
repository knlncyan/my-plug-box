import type { PluginManifest, Plugin, PluginEntry, PluginStatus, Disposable } from './types';
import { DisposableStore } from './disposable';
import { createPluginAPI, type PluginRegistries } from './plugin-api-factory';

export class PluginManager {
    private readonly _plugins = new Map<string, PluginEntry>();
    private readonly _stores = new Map<string, DisposableStore>();
    private readonly _changeListeners = new Set<() => void>();

    constructor(private readonly _registries: PluginRegistries) { }

    // ── Registration ──────────────────────────────────────────────────────────

    /**
     * Register a built-in (compile-time) plugin.
     * Must be called before `activateAll()` or `activate()`.
     */
    registerBuiltin(manifest: PluginManifest, module: Plugin): void {
        if (this._plugins.has(manifest.id)) {
            console.warn(`[PluginManager] Plugin "${manifest.id}" already registered.`);
            return;
        }
        this._plugins.set(manifest.id, { manifest, status: 'registered', module });
        this._notifyChange();
    }

    // ── Activation ────────────────────────────────────────────────────────────

    /**
     * Activate all registered plugins that declare `"onStartup"` as an
     * activation event. Called once at application startup.
     */
    async activateAll(): Promise<void> {
        const pending: Promise<void>[] = [];
        for (const [id, entry] of this._plugins) {
            if (
                entry.status === 'registered' &&
                entry.manifest.activationEvents.includes('onStartup')
            ) {
                pending.push(this.activate(id));
            }
        }
        await Promise.all(pending);
    }

    /** Activate a specific plugin by ID. */
    async activate(pluginId: string): Promise<void> {
        const entry = this._plugins.get(pluginId);
        if (!entry) throw new Error(`[PluginManager] Plugin "${pluginId}" is not registered.`);
        if (entry.status === 'active') return;

        const store = new DisposableStore();
        this._stores.set(pluginId, store);

        const api = createPluginAPI(pluginId, entry.manifest, this._registries, store);

        this._setStatus(pluginId, 'activating');
        try {
            await entry.module?.activate(api);
            this._setStatus(pluginId, 'active');
        } catch (e) {
            store.dispose();
            this._stores.delete(pluginId);
            this._setStatus(pluginId, 'error', String(e));
            console.error(`[PluginManager] Failed to activate "${pluginId}":`, e);
        }
    }

    // ── Deactivation ──────────────────────────────────────────────────────────

    /** Deactivate a plugin, calling its `deactivate()` hook and cleaning up all registrations. */
    async deactivate(pluginId: string): Promise<void> {
        const entry = this._plugins.get(pluginId);
        if (!entry || entry.status !== 'active') return;

        this._setStatus(pluginId, 'deactivating');
        try {
            await entry.module?.deactivate?.();
        } catch (e) {
            console.error(`[PluginManager] Error during deactivation of "${pluginId}":`, e);
        }
        this._stores.get(pluginId)?.dispose();
        this._stores.delete(pluginId);
        this._setStatus(pluginId, 'inactive');
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    getAll(): PluginEntry[] {
        return Array.from(this._plugins.values());
    }

    get(pluginId: string): PluginEntry | undefined {
        return this._plugins.get(pluginId);
    }

    onChange(handler: () => void): Disposable {
        this._changeListeners.add(handler);
        return DisposableStore.from(() => this._changeListeners.delete(handler));
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    private _setStatus(id: string, status: PluginStatus, error?: string): void {
        const entry = this._plugins.get(id);
        if (entry) {
            entry.status = status;
            if (error !== undefined) entry.error = error;
            this._notifyChange();
        }
    }

    private _notifyChange(): void {
        for (const h of this._changeListeners) h();
    }
}
