import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import service from '../../api/plugin.service';
import type {
    ExecuteCommandOptions,
    ExecuteCommandPipelineOptions,
} from '../../domain/runtime';
import type { CommandMeta, PluginSummary } from '../../domain/protocol/plugin-catalog.protocol';
import { shouldActivateOnStartup } from '../utils/activateEventsUtils';
import { PluginDisposable } from '../PluginDisposable';
import { PluginActivationService } from './PluginActivationService';
import { PluginAssetCatalogService } from './PluginAssetCatalogService';
import { PluginCommandService } from './PluginCommandService';
import { WorkerSandboxService } from './WorkerSandboxService';

type Listener = () => void;

export interface CoreRuntimeSnapshot {
    loading: boolean;
    ready: boolean;
    error: string | null;
    activeViewPluginId: string | null;
    plugins: PluginSummary[];
    commands: CommandMeta[];
}

interface PluginRuntimeServiceDeps {
    pluginAssetCatalogService: PluginAssetCatalogService;
    pluginActivationService: PluginActivationService;
    pluginCommandService: PluginCommandService;
    // pluginViewService: PluginViewService;
    workerSandboxService: WorkerSandboxService;
    pluginDisposable: PluginDisposable;
}

/**
 * 插件运行时服务（核心编排层）：
 * 1) 管理运行时快照与订阅通知。
 * 2) 编排插件注册、激活策略、命令调度与 Worker 生命周期。
 */
export class PluginRuntimeService {
    private snapshot: CoreRuntimeSnapshot = {
        loading: false,
        ready: false,
        error: null,
        activeViewPluginId: null,
        plugins: [],
        commands: [],
    };

    private readonly listeners = new Set<Listener>();
    private initPromise: Promise<void> | null = null;
    private shutdownPromise: Promise<void> | null = null;
    private readonly eventUnlisteners: UnlistenFn[] = [];
    private readonly activatedFrontendWorkerIds = new Set<string>();

    constructor(private readonly deps: PluginRuntimeServiceDeps) {
        // 注入 Worker -> 宿主回调，允许插件在 Worker 里请求命令执行与视图切换。
        this.deps.workerSandboxService.setCommandExecutor(
            (commandId: string, options: ExecuteCommandPipelineOptions, ...args: unknown[]) =>
                this.executeCommandInternal(commandId, options, ...args)
        );
        this.deps.workerSandboxService.setViewActivator((pluginId: string) => {
            this.setActiveView(pluginId);
        });
    }

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getSnapshot = (): CoreRuntimeSnapshot => this.snapshot;

    initialize = async (): Promise<void> => {
        if (this.initPromise) return this.initPromise;
        this.initPromise = this.bootstrap().finally(() => {
            this.initPromise = null;
        });
        return this.initPromise;
    };

    /**
     * 运行时关闭流程：
     * 1) 取消后端事件监听。
     * 2) 释放全部插件 Worker。
     * 3) 执行全局资源清理。
     * 4) 重置运行时快照，允许后续重新 initialize。
     */
    shutdown = async (): Promise<void> => {
        if (this.shutdownPromise) return this.shutdownPromise;
        this.shutdownPromise = this.disposeRuntime().finally(() => {
            this.shutdownPromise = null;
        });
        return this.shutdownPromise;
    };

    // setActiveView = (pluginId: string | null): void => {
    //     if (!this.deps.pluginViewService.setActiveView(viewId)) {
    //         this.patch({ error: `View not found: ${String(viewId)}` });
    //         return;
    //     }

    //     this.patch({ activeViewPluginId: this.deps.pluginViewService.getActiveViewId(), error: null });
    //     if (viewId !== null) {
    //         void this.activateForView(viewId);
    //     }
    // };

    setActiveView = (viewId: string | null): void => {
        if (viewId === null) {
            this.patch({ activeViewPluginId: null, error: null });
            return;
        }

        const pluginId = this.resolvePluginId(viewId);
        if (!pluginId) {
            this.patch({ error: `View not found: ${String(viewId)}` });
            return;
        }

        const plugin = this.snapshot.plugins.find((candidate) => candidate.id === pluginId);
        if (!plugin?.view) {
            this.patch({ error: `Plugin "${pluginId}" has no view entry.` });
            return;
        }

        if (!this.deps.pluginActivationService.isPluginActivated(pluginId)) {
            if (!this.deps.pluginActivationService.canActivateForView(pluginId)) {
                this.patch({
                    error: `Plugin "${pluginId}" is not configured for view activation.`,
                });
                return;
            }

            void this.activatePluginWithHooks(pluginId)
                .then(() => this.refreshAll())
                .then(() => {
                    this.patch({ activeViewPluginId: pluginId, error: null });
                })
                .catch((error) => {
                    this.patch({ error: String(error) });
                });
            return;
        }

        this.patch({ activeViewPluginId: pluginId, error: null });
    };

    // ============================= 下面是私有方法 =================================================

    private resolvePluginId(target: string): string | null {
        const plugin = this.snapshot.plugins.find((candidate) => candidate.id === target);
        if (plugin) {
            return plugin.id;
        }

        const pluginByViewId = this.snapshot.plugins.find((candidate) => candidate.view?.id === target);
        if (pluginByViewId) {
            return pluginByViewId.id;
        }

        return this.deps.pluginActivationService.resolvePluginId(target);
    }

    private resolveActivePluginId(plugins: PluginSummary[], preferredPluginId: string | null): string | null {
        const currentPlugin = preferredPluginId
            ? plugins.find((candidate) => candidate.id === preferredPluginId)
            : null;

        if (currentPlugin && /^activated$/i.test(currentPlugin.status) && currentPlugin.view) {
            return currentPlugin.id;
        }

        const firstActivatedWithView = plugins.find(
            (candidate) => /^activated$/i.test(candidate.status) && !!candidate.view
        );
        if (firstActivatedWithView?.view) {
            return firstActivatedWithView.id;
        }

        if (currentPlugin?.view) {
            return currentPlugin.id;
        }

        return plugins.find((candidate) => candidate.view)?.id ?? null;
    }
    executeCommand = async (
        commandId: string,
        options?: ExecuteCommandOptions,
        ...args: unknown[]
    ): Promise<unknown> => {
        return this.executeCommandInternal(commandId, { ...options, trace: [] }, ...args);
    };

    private async executeCommandInternal(
        commandId: string,
        options: ExecuteCommandPipelineOptions,
        ...args: unknown[]
    ): Promise<unknown> {
        return this.deps.pluginCommandService.executeCommand(
            commandId,
            {
                ...options,
                activateView: options.activateView ?? this.setActiveView,
            },
            ...args
        );
    }

    /**
     * 冷启动流程：
     * 1) 注册内置插件元数据
     * 2) 启动状态监听
     * 3) 刷新目录并激活启动插件
     * 4) 同步 Worker 状态并注册后端事件监听
     */
    private async bootstrap(): Promise<void> {
        this.patch({ loading: true, error: null });
        try {
            await this.deps.pluginAssetCatalogService.validateBuiltinModuleConsistency();
            await this.deps.pluginAssetCatalogService.registerBuiltins();
            await this.deps.pluginActivationService.start();
            await this.refreshAll();
            await this.activateStartupPlugins();
            await this.refreshAll();
            await this.syncFrontendModuleState();
            await this.ensureEventListeners();
            this.patch({ loading: false, ready: true, error: null });
        } catch (error) {
            this.patch({ loading: false, ready: false, error: String(error) });
            throw error;
        }
    }

    private async disposeRuntime(): Promise<void> {
        if (this.initPromise) {
            try {
                await this.initPromise;
            } catch {
                // 初始化失败时也继续执行关闭流程，避免残留资源。
            }
        }

        for (const unlisten of this.eventUnlisteners.splice(0)) {
            try {
                unlisten();
            } catch (error) {
                console.error('[PluginRuntime] Failed to unlisten runtime event:', error);
            }
        }

        this.activatedFrontendWorkerIds.clear();

        this.deps.pluginActivationService.syncFromPluginList([]);
        this.deps.pluginCommandService.setCommandCatalog([]);
        await this.deps.pluginDisposable.dispose('__global__');

        this.patch({
            loading: false,
            ready: false,
            error: null,
            activeViewPluginId: null,
            plugins: [],
            commands: [],
        });
    }

    private async activateStartupPlugins(): Promise<void> {
        for (const manifest of this.deps.pluginAssetCatalogService.getAllManifests()) {
            if (!shouldActivateOnStartup(manifest)) continue;
            await this.activatePluginWithHooks(manifest.id);
        }
    }

    private async activatePluginWithHooks(pluginId: string): Promise<void> {
        await this.deps.pluginActivationService.activatePluginWithHooks(pluginId);
        if (this.activatedFrontendWorkerIds.has(pluginId)) return;
        await this.deps.workerSandboxService.activate(pluginId);
        this.activatedFrontendWorkerIds.add(pluginId);
    }

    private async syncFrontendModuleState(): Promise<void> {
        for (const plugin of this.snapshot.plugins) {
            const pluginId = plugin.id;
            const activated = /^activated$/i.test(plugin.status);
            if (activated) {
                if (!this.activatedFrontendWorkerIds.has(pluginId)) {
                    await this.deps.workerSandboxService.activate(pluginId);
                    this.activatedFrontendWorkerIds.add(pluginId);
                }
            } else if (this.activatedFrontendWorkerIds.has(pluginId)) {
                await this.deps.workerSandboxService.deactivate(pluginId);
                this.activatedFrontendWorkerIds.delete(pluginId);
            }
        }
    }

    private async ensureEventListeners(): Promise<void> {
        if (this.eventUnlisteners.length > 0) return;

        const unlistenPluginStatus = await listen('plugin-status-changed', () => {
            void this.refreshPluginsAndCommandsAndHooks();
        });

        this.eventUnlisteners.push(unlistenPluginStatus);
    }

    private async refreshPluginsAndCommandsAndHooks(): Promise<void> {
        try {
            const [plugins, commands] = await Promise.all([service.listPlugins(), service.listCommands()]);
            this.deps.pluginActivationService.syncFromPluginList(plugins);
            this.deps.pluginCommandService.setCommandCatalog(commands);
            this.patch({
                plugins,
                commands,
                activeViewPluginId: this.resolveActivePluginId(plugins, this.snapshot.activeViewPluginId),
                error: null,
            });
            await this.syncFrontendModuleState();
        } catch (error) {
            this.patch({ error: String(error) });
        }
    }

    private async refreshAll(): Promise<void> {
        const [plugins, commands] = await Promise.all([
            service.listPlugins(),
            service.listCommands(),
        ]);
        this.deps.pluginActivationService.syncFromPluginList(plugins);
        this.deps.pluginCommandService.setCommandCatalog(commands);

        this.patch({
            plugins,
            commands,
            activeViewPluginId: this.resolveActivePluginId(plugins, this.snapshot.activeViewPluginId),
            error: null,
        });
    }

    private patch(partial: Partial<CoreRuntimeSnapshot>): void {
        this.snapshot = { ...this.snapshot, ...partial };
        for (const listener of this.listeners) {
            listener();
        }
    }
}
