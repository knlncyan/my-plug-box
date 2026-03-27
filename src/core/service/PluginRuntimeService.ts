import service from '../../api/plugin.service';
import type {
    ExecuteCommandOptions,
    ExecuteCommandPipelineOptions,
    PluginRuntimeSnapshot,
} from '../../domain/runtime';
import type { PluginSummary } from '../../domain/protocol/plugin-catalog.protocol';
import { PluginDisposable } from '../PluginDisposable';
import { PluginAssetCatalogService } from './PluginAssetCatalogService';
import { PluginCommandService } from './PluginCommandService';
import { WorkerSandboxService } from './WorkerSandboxService';

type Listener = () => void;

interface PluginRuntimeServiceDeps {
    pluginAssetCatalogService: PluginAssetCatalogService;
    pluginCommandService: PluginCommandService;
    workerSandboxService: WorkerSandboxService;
    pluginDisposable: PluginDisposable;
}

function statusOf(plugin: PluginSummary | undefined): string {
    return String(plugin?.status ?? '').trim().toLowerCase();
}

function isActivated(plugin: PluginSummary | undefined): boolean {
    return statusOf(plugin) === 'activated';
}

function isDisabled(plugin: PluginSummary | undefined): boolean {
    return statusOf(plugin) === 'disabled';
}

/**
 * 插件运行时服务（核心编排层）：
 * 1) 前端只消费后端状态快照，不在前端维护插件状态机。
 * 2) 负责命令调度、视图切换和 Worker 生命周期。
 */
export class PluginRuntimeService {
    private snapshot: PluginRuntimeSnapshot = {
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
    private readonly activatedFrontendWorkerIds = new Set<string>();

    constructor(private readonly deps: PluginRuntimeServiceDeps) {
        this.deps.workerSandboxService.setCommandExecutor(
            (commandId: string, options: ExecuteCommandPipelineOptions, ...args: unknown[]) =>
                this.executeCommandInternal(commandId, options, ...args)
        );
        this.deps.workerSandboxService.setViewActivator((viewId: string) => {
            this.setActiveView(viewId);
        });
        this.deps.pluginCommandService.setPluginActivator((pluginId, activationEvent) =>
            this.ensurePluginReady(pluginId, activationEvent)
        );
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

    /**
     * 运行中刷新外部插件：
     * - 后端重新扫描并注册插件。
     * - 前端重新拉取最新状态快照并同步 Worker。
     */
    refreshExternalPlugins = async (): Promise<void> => {
        await this.deps.pluginAssetCatalogService.refreshFromBackend();
        await this.refreshAll();
        await this.syncFrontendModuleState();
    };

    shutdown = async (): Promise<void> => {
        if (this.shutdownPromise) return this.shutdownPromise;
        this.shutdownPromise = this.disposeRuntime().finally(() => {
            this.shutdownPromise = null;
        });
        return this.shutdownPromise;
    };

    setActiveView = (viewId: string | null): void => {
        if (viewId === null) {
            this.patch({ activeViewPluginId: null, error: null });
            return;
        }

        const plugin = this.resolvePluginByTarget(viewId);
        if (!plugin) {
            this.patch({ error: `View not found: ${String(viewId)}` });
            return;
        }

        if (!plugin.view) {
            this.patch({ error: `Plugin "${plugin.id}" has no view entry.` });
            return;
        }

        if (isDisabled(plugin)) {
            this.patch({ error: `Plugin "${plugin.id}" is disabled.` });
            return;
        }

        void this.ensurePluginReady(plugin.id, `onView:${plugin.view.id}`)
            .then(() => {
                this.patch({ activeViewPluginId: plugin.id, error: null });
            })
            .catch((error) => {
                this.patch({ error: String(error) });
            });
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
                activateView: options.activateView ?? this.setActiveView,
            },
            ...args
        );
    }

    private resolvePluginByTarget(target: string): PluginSummary | null {
        const byPluginId = this.snapshot.plugins.find((candidate) => candidate.id === target);
        if (byPluginId) {
            return byPluginId;
        }

        const byViewId = this.snapshot.plugins.find((candidate) => candidate.view?.id === target);
        if (byViewId) {
            return byViewId;
        }

        const manifest = this.deps.pluginAssetCatalogService.getManifestByViewId(target);
        if (manifest) {
            return this.snapshot.plugins.find((candidate) => candidate.id === manifest.id) ?? null;
        }

        return null;
    }

    private resolveActivePluginId(plugins: PluginSummary[], preferredPluginId: string | null): string | null {
        const currentPlugin = preferredPluginId
            ? plugins.find((candidate) => candidate.id === preferredPluginId)
            : null;

        if (currentPlugin && isActivated(currentPlugin) && currentPlugin.view && !isDisabled(currentPlugin)) {
            return currentPlugin.id;
        }

        const firstActivatedWithView = plugins.find(
            (candidate) => isActivated(candidate) && !!candidate.view && !isDisabled(candidate)
        );
        if (firstActivatedWithView?.view) {
            return firstActivatedWithView.id;
        }

        const firstViewPlugin = plugins.find((candidate) => candidate.view && !isDisabled(candidate));
        return firstViewPlugin?.id ?? null;
    }

    private activationEventMatches(rule: string, event: string): boolean {
        if (rule === '*') {
            return true;
        }
        if (rule.endsWith('*')) {
            return event.startsWith(rule.slice(0, -1));
        }
        return rule === event;
    }

    private canActivateByEvent(pluginId: string, activationEvent?: string): boolean {
        const manifest = this.deps.pluginAssetCatalogService.getManifestById(pluginId);
        const rules = manifest?.activationEvents ?? [];

        if (rules.length === 0) {
            return true;
        }
        if (!activationEvent) {
            return false;
        }

        return rules.some((rule) => this.activationEventMatches(rule, activationEvent));
    }

    private async bootstrap(): Promise<void> {
        this.patch({ loading: true, error: null });
        try {
            await this.deps.pluginAssetCatalogService.validateManifestConsistency();
            await this.deps.pluginAssetCatalogService.registerPlugins();
            await this.refreshAll();
            await this.syncFrontendModuleState();
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
                // 初始化失败时也继续关闭，避免资源泄漏。
            }
        }
        this.activatedFrontendWorkerIds.clear();
        this.deps.pluginCommandService.setCommandCatalog([]);
        this.deps.pluginCommandService.setPluginCatalog([]);
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

    private async ensurePluginReady(pluginId: string, activationEvent?: string): Promise<void> {
        const current = this.snapshot.plugins.find((candidate) => candidate.id === pluginId);
        if (!current) {
            throw new Error(`Plugin not found: ${pluginId}`);
        }

        if (isDisabled(current)) {
            throw new Error(`Plugin "${pluginId}" is disabled`);
        }

        if (!isActivated(current)) {
            if (!this.canActivateByEvent(pluginId, activationEvent)) {
                const trigger = activationEvent ?? '<none>';
                throw new Error(`Plugin "${pluginId}" is not configured for activation event: ${trigger}`);
            }

            await service.activatePlugin(pluginId);
            await this.refreshAll();

            const refreshed = this.snapshot.plugins.find((candidate) => candidate.id === pluginId);
            if (!isActivated(refreshed)) {
                const errorText = refreshed?.error ? ` (${refreshed.error})` : '';
                throw new Error(`Activate plugin failed: ${pluginId}${errorText}`);
            }
        }

        if (!this.activatedFrontendWorkerIds.has(pluginId)) {
            await this.deps.workerSandboxService.activate(pluginId);
            this.activatedFrontendWorkerIds.add(pluginId);
        }
    }

    private async syncFrontendModuleState(): Promise<void> {
        for (const plugin of this.snapshot.plugins) {
            const pluginId = plugin.id;
            if (isActivated(plugin) && !isDisabled(plugin)) {
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

    private async refreshAll(): Promise<void> {
        const [pluginsReponse, commandsReponse] = await Promise.all([service.listPlugins(), service.listCommands()]);
        const plugins = pluginsReponse.data ?? [];
        const commands = commandsReponse.data ?? [];

        this.deps.pluginCommandService.setPluginCatalog(plugins);
        this.deps.pluginCommandService.setCommandCatalog(commands);

        this.patch({
            plugins,
            commands,
            activeViewPluginId: this.resolveActivePluginId(plugins, this.snapshot.activeViewPluginId),
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