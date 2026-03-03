/**
 * 前端插件运行时编排器。
 * 仅负责流程与状态：
 * 1) 元数据注册/拉取
 * 2) 激活策略判定
 * 3) 命令执行调度
 * 4) Worker 沙箱生命周期管理
 */
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { CommandMeta, PluginSummary, ViewMeta } from './pluginRuntime.protocol';
import service from './pluginBackend.service';
import {
    shouldActivateForCommand,
    shouldActivateForView,
    shouldActivateOnStartup,
} from './pluginRuntime.activation';
import { PluginApiRegistry } from './pluginRuntime.api';
import { PluginWorkerSandbox } from './pluginWorkerSandbox';
import { PluginRuntimeAssets } from './pluginRuntime.assets';

export interface ExecuteCommandOptions {
    activateView?: (viewId: string) => void;
}

interface ExecuteCommandInternalOptions extends ExecuteCommandOptions {
    callerPluginId?: string;
    trace?: string[];
}

export interface PluginRuntimeSnapshot {
    loading: boolean;
    ready: boolean;
    error: string | null;
    activeViewId: string | null;
    plugins: PluginSummary[];
    views: ViewMeta[];
    commands: CommandMeta[];
}

type Listener = () => void;

class PluginRuntimeStore {
    private snapshot: PluginRuntimeSnapshot = {
        loading: false,
        ready: false,
        error: null,
        activeViewId: null,
        plugins: [],
        views: [],
        commands: [],
    };

    private readonly listeners = new Set<Listener>();
    private initPromise: Promise<void> | null = null;
    private eventUnlisteners: UnlistenFn[] = [];
    private readonly activatedPluginsIdSet = new Set<string>();
    private readonly assets = new PluginRuntimeAssets();

    /**
     * 一个全局的插件api注册器，用于注册api
     */
    private readonly pluginApiRegistry = new PluginApiRegistry({
        executeCommand: (commandId: string, callerPluginId: string, ...args: unknown[]) =>
            this.executeCommandInternal(commandId, { callerPluginId, trace: [] }, ...args),
        setActiveView: (viewId: string) => this.setActiveView(viewId),
    });

    private readonly workerSandbox = new PluginWorkerSandbox({
        hostApiRegistry: this.pluginApiRegistry,
        executeCommandFromPlugin: (
            callerPluginId: string,
            commandId: string,
            trace: string[],
            ...args: unknown[]
        ) => this.executeCommandInternal(commandId, { callerPluginId, trace }, ...args),
        setActiveView: (viewId: string) => this.setActiveView(viewId),
    });



    /**
     * 供 useSyncExternalStore 订阅快照变化。
     */
    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    /**
     * 读取当前运行时快照。
     */
    getSnapshot = (): PluginRuntimeSnapshot => this.snapshot;

    /**
     * 启动运行时。
     * 使用 initPromise 做串行保护，避免重复初始化。
     */
    initialize = async (): Promise<void> => {
        if (this.initPromise) return this.initPromise;
        this.initPromise = this.bootstrap().finally(() => {
            this.initPromise = null;
        });
        return this.initPromise;
    };

    /**
     * 设置当前激活视图；如果视图有效则异步触发按视图激活。
     */
    setActiveView = (viewId: string | null): void => {
        if (viewId === null) {
            this.patch({ activeViewId: null });
            return;
        }
        if (!this.snapshot.views.some((view) => view.id === viewId)) {
            this.patch({ error: `View not found: ${viewId}` });
            return;
        }
        this.patch({ activeViewId: viewId });
        void this.activateForView(viewId);
    };

    /**
     * 按视图触发插件激活（如侧栏点击视图）。
     */
    activateForView = async (viewId: string): Promise<void> => {
        const view = this.snapshot.views.find((candidate) => candidate.id === viewId);
        if (!view) return;

        const pluginId = view.plugin_id;
        if (this.isPluginActivated(pluginId)) return;
        if (!this.canActivateForView(pluginId, viewId)) {
            this.patch({
                error: `Plugin "${pluginId}" is not configured for view activation: ${viewId}`,
            });
            return;
        }

        await this.activatePluginWithHooks(pluginId);
        await this.refreshAll();
    };

    /**
     * 对外命令执行入口。
     */
    executeCommand = async (
        commandId: string,
        options?: ExecuteCommandOptions,
        ...args: unknown[]
    ): Promise<unknown> => {
        return this.executeCommandInternal(commandId, { ...options, trace: [] }, ...args);
    };

    /**
     * 命令执行核心流程：
     * 1) 确保命令目录已就绪
     * 2) 校验命令存在
     * 3) 检测循环调用
     * 4) 按需激活目标插件
     * 5) 委托给插件 Worker 执行命令
     */
    private async executeCommandInternal(
        commandId: string,
        options: ExecuteCommandInternalOptions,
        ...args: unknown[]
    ): Promise<unknown> {
        await this.ensureCommandCatalogReady();

        const commandMeta = this.snapshot.commands.find((command) => command.id === commandId);
        if (!commandMeta) {
            throw new Error(`Command not found: ${commandId}`);
        }

        // 命令链路防循环：A -> B -> A 会在这里被拦截。
        const trace = options.trace ?? [];
        if (trace.includes(commandId)) {
            const chain = [...trace, commandId].join(' -> ');
            throw new Error(`Detected command cycle: ${chain}`);
        }
        const nextTrace = [...trace, commandId];

        const ownerPluginId = commandMeta.plugin_id;
        if (!this.isPluginActivated(ownerPluginId)) {
            if (!this.canActivateForCommand(ownerPluginId, commandId)) {
                throw new Error(
                    `Plugin "${ownerPluginId}" is not configured for command activation: ${commandId}`
                );
            }
            await this.activatePluginWithHooks(ownerPluginId);
            await this.refreshAll();
        }

        const result = await this.workerSandbox.executeCommand(ownerPluginId, commandId, args, nextTrace);

        // 兼容外部调用方视图回调：命令返回 viewId 时触发 activateView。
        if (typeof result === 'string' && options.activateView) {
            const targetView = this.snapshot.views.find((view) => view.id === result);
            if (targetView) {
                options.activateView(result);
            }
        }

        return result;
    }

    /**
     * 运行时初始化总流程。
     */
    private async bootstrap(): Promise<void> {
        this.patch({ loading: true, error: null });
        try {
            await this.assets.registerBuiltins();
            await this.pluginApiRegistry.initializePersistence();
            await this.refreshAll();
            await this.activateStartupPlugins();
            await this.refreshAll();
            await this.syncFrontendModuleState();
            await this.ensureEventListeners();
            this.patch({ loading: false, ready: true });
        } catch (error) {
            this.patch({ loading: false, ready: false, error: String(error) });
            throw error;
        }
    }

    /**
     * 激活所有 onStartup 插件（或未声明 activationEvents 的插件）。
     */
    private async activateStartupPlugins(): Promise<void> {
        for (const manifest of this.assets.getAllManifests()) {
            if (!shouldActivateOnStartup(manifest)) continue;
            await this.activatePluginWithHooks(manifest.id);
        }
    }

    /**
     * 激活单个插件：先激活后端状态，再激活前端 Worker 模块。
     */
    private async activatePluginWithHooks(pluginId: string): Promise<void> {
        await service.activatePlugin(pluginId);

        if (this.activatedPluginsIdSet.has(pluginId)) return;
        await this.workerSandbox.activate(pluginId);
        this.activatedPluginsIdSet.add(pluginId);
    }

    /**
     * 同步前端 Worker 激活状态与后端插件状态。
     */
    private async syncFrontendModuleState(): Promise<void> {
        for (const plugin of this.snapshot.plugins) {
            const pluginId = plugin.id;

            if (this.isPluginActivated(pluginId)) {
                if (!this.activatedPluginsIdSet.has(pluginId)) {
                    await this.workerSandbox.activate(pluginId);
                    this.activatedPluginsIdSet.add(pluginId);
                }
            } else if (this.activatedPluginsIdSet.has(pluginId)) {
                await this.workerSandbox.deactivate(pluginId);
                this.activatedPluginsIdSet.delete(pluginId);
            }
        }
    }

    /**
     * 判断插件是否允许因命令触发激活。
     */
    private canActivateForCommand(pluginId: string, commandId: string): boolean {
        const manifest = this.assets.getManifest(pluginId);
        if (!manifest) return false;
        return shouldActivateOnStartup(manifest) || shouldActivateForCommand(manifest, commandId);
    }

    /**
     * 判断插件是否允许因视图触发激活。
     */
    private canActivateForView(pluginId: string, viewId: string): boolean {
        const manifest = this.assets.getManifest(pluginId);
        if (!manifest) return false;
        return shouldActivateOnStartup(manifest) || shouldActivateForView(manifest, viewId);
    }

    /**
     * 判断插件快照状态是否为 Activated。
     */
    private isPluginActivated(pluginId: string): boolean {
        const status = this.snapshot.plugins.find((plugin) => plugin.id === pluginId)?.status ?? '';
        return /^activated$/i.test(status);
    }

    /**
     * 命令执行前确保 commands 元数据已拉取。
     */
    private async ensureCommandCatalogReady(): Promise<void> {
        if (this.snapshot.commands.length > 0) return;
        const commands = await service.listCommands();
        this.patch({ commands });
    }

    /**
     * 注册后端事件监听（视图注册变化、插件状态变化）。
     */
    private async ensureEventListeners(): Promise<void> {
        if (this.eventUnlisteners.length > 0) return;

        const unlistenViews = await listen('views-registered', () => {
            void this.refreshViewsOnly();
        });
        const unlistenPluginStatus = await listen('plugin-status-changed', () => {
            void this.refreshPluginsAndCommandsAndHooks();
        });

        this.eventUnlisteners.push(unlistenViews, unlistenPluginStatus);
    }

    /**
     * 仅刷新视图相关数据。
     */
    private async refreshViewsOnly(): Promise<void> {
        try {
            const views = await service.listViews();
            this.patch({ views, activeViewId: this.resolveActiveViewId(views) });
        } catch (error) {
            this.patch({ error: String(error) });
        }
    }

    /**
     * 刷新插件与命令，并同步 Worker 生命周期。
     */
    private async refreshPluginsAndCommandsAndHooks(): Promise<void> {
        try {
            const [plugins, commands] = await Promise.all([service.listPlugins(), service.listCommands()]);
            this.patch({ plugins, commands });
            await this.syncFrontendModuleState();
        } catch (error) {
            this.patch({ error: String(error) });
        }
    }

    /**
     * 全量刷新 plugins/views/commands。
     */
    private async refreshAll(): Promise<void> {
        const [plugins, views, commands] = await Promise.all([
            service.listPlugins(),
            service.listViews(),
            service.listCommands(),
        ]);
        this.patch({
            plugins,
            views,
            commands,
            activeViewId: this.resolveActiveViewId(views),
        });
    }

    /**
     * 解析有效 activeViewId：优先保留当前，其次回退到第一个视图。
     */
    private resolveActiveViewId(views: ViewMeta[]): string | null {
        const current = this.snapshot.activeViewId;
        if (current && views.some((view) => view.id === current)) {
            return current;
        }
        return views[0]?.id ?? null;
    }

    /**
     * 局部更新快照并通知订阅者。
     */
    private patch(partial: Partial<PluginRuntimeSnapshot>): void {
        this.snapshot = { ...this.snapshot, ...partial };
        for (const listener of this.listeners) {
            listener();
        }
    }
}

export const pluginRuntime = new PluginRuntimeStore();
