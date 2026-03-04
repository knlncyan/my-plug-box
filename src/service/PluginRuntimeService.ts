import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import service from '../api/pluginBackend.service';
import type {
  ExecuteCommandOptions,
  ExecuteCommandPipelineOptions,
  PluginRuntimeSnapshot,
} from '../domain/runtime';
import { shouldActivateOnStartup } from '../utils/activateEventsUtils';
import { PluginActivationService } from './PluginActivationService';
import { PluginAssetCatalogService } from './PluginAssetCatalogService';
import { PluginCommandService } from './PluginCommandService';
import { PluginViewService } from './PluginViewService';
import { WorkerSandboxService } from './WorkerSandboxService';

type Listener = () => void;

interface PluginRuntimeServiceDeps {
  pluginAssetCatalogService: PluginAssetCatalogService;
  pluginActivationService: PluginActivationService;
  pluginCommandService: PluginCommandService;
  pluginViewService: PluginViewService;
  workerSandboxService: WorkerSandboxService;
}

/**
 * 插件运行时服务（核心编排层）：
 * 1) 管理运行时快照与订阅通知。
 * 2) 编排插件注册、激活策略、命令调度与 Worker 生命周期。
 */
export class PluginRuntimeService {
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
  private readonly eventUnlisteners: UnlistenFn[] = [];
  private readonly activatedFrontendWorkerIds = new Set<string>();

  constructor(private readonly deps: PluginRuntimeServiceDeps) {
    // 注入 Worker -> 宿主回调，允许插件在 Worker 里请求命令执行与视图切换。
    this.deps.workerSandboxService.setCommandExecutor(
      (commandId: string, options: ExecuteCommandPipelineOptions, ...args: unknown[]) =>
        this.executeCommandInternal(commandId, options, ...args)
    );
    this.deps.workerSandboxService.setViewActivator((viewId: string) => {
      this.setActiveView(viewId);
    });
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): PluginRuntimeSnapshot => this.snapshot;

  initialize = async (): Promise<void> => {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.bootstrap().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  };

  setActiveView = (viewId: string | null): void => {
    if (!this.deps.pluginViewService.setActiveView(viewId)) {
      this.patch({ error: `View not found: ${String(viewId)}` });
      return;
    }

    this.patch({ activeViewId: this.deps.pluginViewService.getActiveViewId(), error: null });
    if (viewId !== null) {
      void this.activateForView(viewId);
    }
  };

  activateForView = async (viewId: string): Promise<void> => {
    const view = this.snapshot.views.find((candidate) => candidate.id === viewId);
    if (!view) return;

    const pluginId = view.plugin_id;
    if (this.deps.pluginActivationService.isPluginActivated(pluginId)) return;
    if (!this.deps.pluginActivationService.canActivateForView(pluginId, viewId)) {
      this.patch({
        error: `Plugin "${pluginId}" is not configured for view activation: ${viewId}`,
      });
      return;
    }

    await this.activatePluginWithHooks(pluginId);
    await this.refreshAll();
  };

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
        activateView: options.activateView ?? ((viewId: string) => this.setActiveView(viewId)),
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

    const unlistenViews = await listen('views-registered', () => {
      void this.refreshViewsOnly();
    });
    const unlistenPluginStatus = await listen('plugin-status-changed', () => {
      void this.refreshPluginsAndCommandsAndHooks();
    });

    this.eventUnlisteners.push(unlistenViews, unlistenPluginStatus);
  }

  private async refreshViewsOnly(): Promise<void> {
    try {
      const views = await service.listViews();
      this.deps.pluginViewService.setViews(views);
      this.patch({
        views,
        activeViewId: this.deps.pluginViewService.getActiveViewId(),
        error: null,
      });
    } catch (error) {
      this.patch({ error: String(error) });
    }
  }

  private async refreshPluginsAndCommandsAndHooks(): Promise<void> {
    try {
      const [plugins, commands] = await Promise.all([service.listPlugins(), service.listCommands()]);
      this.deps.pluginActivationService.syncFromPluginList(plugins);
      this.deps.pluginCommandService.setCommandCatalog(commands);
      this.patch({ plugins, commands, error: null });
      await this.syncFrontendModuleState();
    } catch (error) {
      this.patch({ error: String(error) });
    }
  }

  private async refreshAll(): Promise<void> {
    const [plugins, views, commands] = await Promise.all([
      service.listPlugins(),
      service.listViews(),
      service.listCommands(),
    ]);
    this.deps.pluginActivationService.syncFromPluginList(plugins);
    this.deps.pluginViewService.setViews(views);
    this.deps.pluginCommandService.setCommandCatalog(commands);

    this.patch({
      plugins,
      views,
      commands,
      activeViewId: this.deps.pluginViewService.getActiveViewId(),
      error: null,
    });
  }

  private patch(partial: Partial<PluginRuntimeSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const listener of this.listeners) {
      listener();
    }
  }
}
