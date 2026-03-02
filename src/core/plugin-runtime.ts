/**
 * Frontend plugin runtime orchestration.
 * Focuses on flow/state; API-surface and activation rules are delegated.
 */
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  CommandExecutionContext,
  CommandMeta,
  PluginSummary,
  ViewMeta,
} from './plugin-protocol';
import service from './pluginBackend.service';
import {
  shouldActivateForCommand,
  shouldActivateForView,
  shouldActivateOnStartup,
} from './plugin-runtime.activation';
import { PluginHostApiRegistry } from './plugin-runtime.api';
import { PluginRuntimeCatalog } from './plugin-runtime.catalog';

export interface ExecuteCommandOptions {
  activateView?: (viewId: string) => void;
}

interface ExecuteCommandInternalOptions extends ExecuteCommandOptions {
  callerPluginId?: string;
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
  private readonly activatedFrontendModules = new Set<string>();

  private readonly hostApiRegistry = new PluginHostApiRegistry({
    executeCommand: (commandId: string, callerPluginId: string, ...args: unknown[]) =>
      this.executeCommand(commandId, { callerPluginId }, ...args),
    setActiveView: (viewId: string) => this.setActiveView(viewId),
  });
  private readonly catalog = new PluginRuntimeCatalog({
    hostApiRegistry: this.hostApiRegistry,
  });

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

  executeCommand = async (
    commandId: string,
    options?: ExecuteCommandInternalOptions,
    ...args: unknown[]
  ): Promise<unknown> => {
    await this.ensureCommandCatalogReady();

    const commandMeta = this.snapshot.commands.find((command) => command.id === commandId);
    if (!commandMeta) {
      throw new Error(`Command not found: ${commandId}`);
    }

    const callerPluginId = options?.callerPluginId;
    const ownerPluginId = commandMeta.plugin_id;
    const isCrossPluginInvocation =
      callerPluginId !== undefined && callerPluginId !== ownerPluginId;

    if (isCrossPluginInvocation && !commandMeta.expose) {
      throw new Error(`Command is not exposed for cross-plugin invocation: ${commandId}`);
    }

    await service.assertCommandExposed(commandId, callerPluginId);

    if (!this.isPluginActivated(ownerPluginId)) {
      if (!this.canActivateForCommand(ownerPluginId, commandId)) {
        throw new Error(
          `Plugin "${ownerPluginId}" is not configured for command activation: ${commandId}`
        );
      }
      await this.activatePluginWithHooks(ownerPluginId);
      await this.refreshAll();
    }

    const entry = this.catalog.getCommandHandler(commandId);
    if (!entry) {
      throw new Error(`Command handler is not implemented for: ${commandId}`);
    }

    const context: CommandExecutionContext = {
      activateView: (viewId: string) => {
        this.setActiveView(viewId);
        options?.activateView?.(viewId);
      },
      executeCommand: (nestedCommandId: string, ...nestedArgs: unknown[]) =>
        this.executeCommand(nestedCommandId, { callerPluginId: entry.pluginId }, ...nestedArgs),
      api: this.hostApiRegistry.getOrCreate(entry.pluginId),
    };

    return entry.handler(context, ...args);
  };

  private async bootstrap(): Promise<void> {
    this.patch({ loading: true, error: null });
    try {
      await this.catalog.registerBuiltins();
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

  private async activateStartupPlugins(): Promise<void> {
    for (const manifest of this.catalog.getAllManifests()) {
      if (!shouldActivateOnStartup(manifest)) continue;
      await this.activatePluginWithHooks(manifest.id);
    }
  }

  private async activatePluginWithHooks(pluginId: string): Promise<void> {
    await service.activatePlugin(pluginId);

    const module = this.catalog.getModule(pluginId);
    if (!module || this.activatedFrontendModules.has(pluginId)) return;

    await module.activate?.(this.hostApiRegistry.getOrCreate(pluginId));
    this.activatedFrontendModules.add(pluginId);
  }

  private async syncFrontendModuleState(): Promise<void> {
    for (const plugin of this.snapshot.plugins) {
      const pluginId = plugin.id;
      const module = this.catalog.getModule(pluginId);
      if (!module) continue;

      if (this.isPluginActivated(pluginId)) {
        if (!this.activatedFrontendModules.has(pluginId)) {
          await module.activate?.(this.hostApiRegistry.getOrCreate(pluginId));
          this.activatedFrontendModules.add(pluginId);
        }
      } else if (this.activatedFrontendModules.has(pluginId)) {
        await module.deactivate?.(this.hostApiRegistry.getOrCreate(pluginId));
        this.hostApiRegistry.disposePluginResources(pluginId);
        this.activatedFrontendModules.delete(pluginId);
      }
    }
  }

  private canActivateForCommand(pluginId: string, commandId: string): boolean {
    const manifest = this.catalog.getManifest(pluginId);
    if (!manifest) return false;
    return shouldActivateOnStartup(manifest) || shouldActivateForCommand(manifest, commandId);
  }

  private canActivateForView(pluginId: string, viewId: string): boolean {
    const manifest = this.catalog.getManifest(pluginId);
    if (!manifest) return false;
    return shouldActivateOnStartup(manifest) || shouldActivateForView(manifest, viewId);
  }

  private isPluginActivated(pluginId: string): boolean {
    const status = this.snapshot.plugins.find((plugin) => plugin.id === pluginId)?.status ?? '';
    return /^activated$/i.test(status);
  }

  private async ensureCommandCatalogReady(): Promise<void> {
    if (this.snapshot.commands.length > 0) return;
    const commands = await service.listCommands();
    this.patch({ commands });
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
      this.patch({ views, activeViewId: this.resolveActiveViewId(views) });
    } catch (error) {
      this.patch({ error: String(error) });
    }
  }

  private async refreshPluginsAndCommandsAndHooks(): Promise<void> {
    try {
      const [plugins, commands] = await Promise.all([
        service.listPlugins(),
        service.listCommands(),
      ]);
      this.patch({ plugins, commands });
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
    this.patch({
      plugins,
      views,
      commands,
      activeViewId: this.resolveActiveViewId(views),
    });
  }

  private resolveActiveViewId(views: ViewMeta[]): string | null {
    const current = this.snapshot.activeViewId;
    if (current && views.some((view) => view.id === current)) {
      return current;
    }
    return views[0]?.id ?? null;
  }

  private patch(partial: Partial<PluginRuntimeSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const pluginRuntime = new PluginRuntimeStore();
