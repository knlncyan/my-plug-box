/**
 * 插件 API 注册中心。
 * 负责为每个插件提供隔离作用域的命令/视图/事件/设置/存储能力。
 *
 * 持久化策略：
 * 1) settings：Rust 端单文件 JSON（全局）。
 * 2) storage：Rust 端按插件分文件 JSON。
 */
import type { PluginDisposable, PluginHostAPI } from './pluginRuntime.protocol';
import service from './pluginBackend.service';

type HostEventHandler = (payload: unknown) => void;
type SettingChangeHandler = (value: unknown) => void;

interface PluginApiRegistryDeps {
    executeCommand: (
        commandId: string,
        callerPluginId: string,
        ...args: unknown[]
    ) => Promise<unknown>;
    setActiveView: (viewId: string) => void;
}

export class PluginApiRegistry {
    private readonly apisByPluginId = new Map<string, PluginHostAPI>();
    // 全局事件监听：key=事件名，value=订阅者集合。
    private readonly hostEventListeners = new Map<
        string,
        Set<{ pluginId: string; handler: HostEventHandler }>
    >();
    // 设置变更监听：key=作用域设置键（pluginId.key），value=订阅者集合。
    private readonly settingChangeListeners = new Map<
        string,
        Set<{ pluginId: string; handler: SettingChangeHandler }>
    >();
    // 插件资源释放器集合，用于插件停用时统一清理。
    private readonly pluginDisposables = new Map<string, Set<() => void>>();

    // 内存缓存：settings 使用扁平结构（pluginId.key -> value）。
    private settingsValues: Record<string, unknown> = {};
    // 内存缓存：storage 按插件拆分（pluginId -> { key: value }）。
    private readonly storageValuesByPluginId = new Map<string, Record<string, unknown>>();

    private settingsInitialized = false;
    private settingsInitPromise: Promise<void> | null = null;
    private readonly storageInitPromises = new Map<string, Promise<void>>();

    /**
     * 注入宿主能力依赖（命令执行、视图激活）。
     */
    constructor(private readonly deps: PluginApiRegistryDeps) {

    }

    /**
     * 初始化持久化缓存（启动阶段调用一次）。
     */
    async initializePersistence(): Promise<void> {
        if (this.settingsInitialized) return;
        if (this.settingsInitPromise) return this.settingsInitPromise;

        this.settingsInitPromise = (async () => {
            this.settingsValues = await service.getAllPluginSettings();
            this.settingsInitialized = true;
        })().finally(() => {
            this.settingsInitPromise = null;
        });

        return this.settingsInitPromise;
    }

    /**
     * 获取或创建插件主进程 Host API 实例。
     */
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

    /**
     * 获取插件设置快照（仅当前插件作用域）。
     */
    async getPluginSettingsSnapshot(pluginId: string): Promise<Record<string, unknown>> {
        await this.initializePersistence();

        const prefix = `${pluginId}.`;
        const snapshot: Record<string, unknown> = {};

        for (const [scopedKey, value] of Object.entries(this.settingsValues)) {
            if (!scopedKey.startsWith(prefix)) continue;
            const key = scopedKey.slice(prefix.length);
            snapshot[key] = value;
        }

        return snapshot;
    }

    /**
     * 获取插件存储快照（按插件分文件）。
     */
    async getPluginStorageSnapshot(pluginId: string): Promise<Record<string, unknown>> {
        await this.ensurePluginStorageLoaded(pluginId);
        return { ...(this.storageValuesByPluginId.get(pluginId) ?? {}) };
    }

    /**
     * 释放某个插件在 Host API 层注册的所有资源。
     */
    disposePluginResources(pluginId: string): void {
        const disposables = this.pluginDisposables.get(pluginId);
        if (!disposables) return;

        for (const dispose of [...disposables]) {
            try {
                dispose();
            } catch (error) {
                console.error(`[plugin-runtime] failed to dispose plugin resource: ${pluginId}`, error);
            }
        }
        this.pluginDisposables.delete(pluginId);
    }

    /**
     * 广播宿主事件给所有已订阅插件。
     */
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

    /**
     * 为插件注册事件监听，并返回可释放句柄。
     */
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

    /**
     * 读取插件作用域设置。
     */
    private getPluginSetting<T>(pluginId: string, key: string): T | undefined {
        const scopedKey = this.toPluginSettingKey(pluginId, key);
        return this.settingsValues[scopedKey] as T | undefined;
    }

    /**
     * 写入插件作用域设置并触发 onChange。
     */
    private setPluginSetting(pluginId: string, key: string, value: unknown): void {
        const scopedKey = this.toPluginSettingKey(pluginId, key);
        this.settingsValues[scopedKey] = value;

        void service.setPluginSetting(pluginId, key, value).catch((error) => {
            console.error(`[plugin-runtime] failed to persist setting: ${scopedKey}`, error);
        });

        this.emitSettingChange(scopedKey, value);
    }

    /**
     * 注册设置变更监听。
     */
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

    /**
     * 向订阅者分发设置变更。
     */
    private emitSettingChange(scopedKey: string, value: unknown): void {
        const listeners = this.settingChangeListeners.get(scopedKey);
        if (!listeners) return;

        for (const { handler } of listeners) {
            try {
                handler(value);
            } catch (error) {
                console.error(`[plugin-runtime] setting change handler error for "${scopedKey}":`, error);
            }
        }
    }

    /**
     * 读取插件本地存储值。
     */
    private getPluginStorage<T>(pluginId: string, key: string): T | undefined {
        const record = this.storageValuesByPluginId.get(pluginId);
        return record?.[key] as T | undefined;
    }

    /**
     * 写入插件本地存储值。
     */
    private setPluginStorage(pluginId: string, key: string, value: unknown): void {
        let record = this.storageValuesByPluginId.get(pluginId);
        if (!record) {
            record = {};
            this.storageValuesByPluginId.set(pluginId, record);
        }

        record[key] = value;

        void service.setPluginStorageValue(pluginId, key, value).catch((error) => {
            console.error(`[plugin-runtime] failed to persist storage: ${pluginId}.${key}`, error);
        });
    }

    /**
     * 生成 settings 的作用域 key（pluginId.key）。
     */
    private toPluginSettingKey(pluginId: string, key: string): string {
        return `${pluginId}.${key}`;
    }

    /**
     * 创建可自动追踪的 disposable 资源。
     */
    private createPluginDisposable(pluginId: string, teardown: () => void): PluginDisposable {
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

    /**
     * 确保某个插件的 storage 快照已从后端加载到内存。
     */
    private async ensurePluginStorageLoaded(pluginId: string): Promise<void> {
        if (this.storageValuesByPluginId.has(pluginId)) return;

        const existingPromise = this.storageInitPromises.get(pluginId);
        if (existingPromise) {
            await existingPromise;
            return;
        }

        const loadPromise = (async () => {
            const snapshot = await service.getPluginStorageSnapshot(pluginId);
            this.storageValuesByPluginId.set(pluginId, { ...snapshot });
        })().finally(() => {
            this.storageInitPromises.delete(pluginId);
        });

        this.storageInitPromises.set(pluginId, loadPromise);
        await loadPromise;
    }
}
