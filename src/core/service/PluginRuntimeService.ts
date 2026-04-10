import type {
    ExecuteCommandOptions,
    ExecuteCommandPipelineOptions,
    PluginRuntimeSnapshot,
} from '../../domain/runtime';
import type { PluginEntry } from '../../domain/protocol/plugin-entity.protocol';
import { PluginDisposable } from '../PluginDisposable';
import { PluginRuntimeCatalogService } from './PluginRuntimeCatalogService';
import { WorkerSandboxService } from './WorkerSandboxService';
import { activationEventMatches, isActivated, isDisabled } from '../utils/pluginUtils';
import { CommandShortcutService } from './CommandShortcutService';

type Listener = () => void;

interface PluginRuntimeServiceDeps {
    pluginRuntimeCatalogService: PluginRuntimeCatalogService;
    workerSandboxService: WorkerSandboxService;
    commandShortcutService: CommandShortcutService;
    pluginDisposable: PluginDisposable;
}

export class PluginRuntimeService {
    private snapshot: PluginRuntimeSnapshot = {
        loading: false,
        ready: false,
        error: null,
        activeViewPluginId: null,
        plugins: [],
    };
    private readonly activatedFrontendWorkerIds = new Set<string>();
    private readonly listeners = new Set<Listener>();
    private initPromise: Promise<void> | null = null;
    private shutdownPromise: Promise<void> | null = null;


    constructor(private readonly deps: PluginRuntimeServiceDeps) {
        this.deps.workerSandboxService.init(
            (commandId: string, options: ExecuteCommandPipelineOptions, ...args: unknown[]) => this.executeCommandInternal(commandId, options, ...args),
            (viewId: string) => this.setActiveView(viewId)

        );
        this.deps.commandShortcutService.init((commandId: string) => this.executeCommand(commandId));
        this.deps.pluginRuntimeCatalogService.init(() => this.refreshAll());
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

    private async bootstrap(): Promise<void> {
        this.patch({ loading: true, error: null });
        try {
            await this.deps.pluginRuntimeCatalogService.start();
            await this.deps.commandShortcutService.start();
            await this.refreshAll();
            this.patch({ loading: false, ready: true, error: null });
        } catch (error) {
            this.patch({ loading: false, ready: false, error: String(error) });
            throw error;
        }
    }

    refresh = async (): Promise<void> => {
        await this.refreshAll();
    };

    shutdown = async (): Promise<void> => {
        if (this.shutdownPromise) return this.shutdownPromise;
        this.shutdownPromise = this.disposeRuntime().finally(() => {
            this.shutdownPromise = null;
        });
        return this.shutdownPromise;
    };

    // ========================================================= 上面的方法是基本核心方法 ==============================================================

    /**
     * 激活相应插件的视图
     * @param pluginId 插件id
     */
    setActiveView = (pluginId: string | null): void => {
        if (pluginId === null) {
            this.patch({ activeViewPluginId: null, error: null });
            return;
        }

        const plugin = this.deps.pluginRuntimeCatalogService.getPluginEntryById(pluginId);
        if (!plugin) {
            this.patch({ error: `View's pluginId not found: ${String(pluginId)}` });
            return;
        }

        if (!plugin.viewMeta) {
            this.patch({ error: `Plugin "${plugin.pluginId}" has no view entry.` });
            return;
        }

        void this.ensurePluginReady(plugin, `onView:${pluginId}`)
            .then(() => {
                this.patch({ activeViewPluginId: plugin.pluginId, error: null });
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
        // await this.ensureLoaded();

        const commandMeta = this.deps.pluginRuntimeCatalogService.getCommandById(commandId);
        if (!commandMeta) {
            throw new Error(`Command not found: ${commandId}`);
        }

        // 命令链路防循环：A -> B -> A。
        const trace = options.trace ?? [];
        if (trace.includes(commandId)) {
            const chain = [...trace, commandId].join(' -> ');
            throw new Error(`Detected command cycle: ${chain}`);
        }
        const nextTrace = [...trace, commandId];

        const ownerPluginId = commandMeta.pluginId;

        await this.ensurePluginReady(ownerPluginId, `onCommand:${commandId}`);

        const result = await this.deps.workerSandboxService.executeCommand(
            ownerPluginId,
            commandId,
            args,
            nextTrace
        );

        return result;
    }

    private async disposeRuntime(): Promise<void> {
        if (this.initPromise) {
            try {
                await this.initPromise;
            } catch {
                console.log('程序初始化失败，仍然进行资源释放');
            }
        }

        this.activatedFrontendWorkerIds.clear();
        await this.deps.pluginDisposable.dispose('__global__');
        this.patch({
            loading: false,
            ready: false,
            error: null,
            activeViewPluginId: null,
            plugins: [],
        });
    }

    // 校验事件激活
    private canActivateByEvent(plugin: PluginEntry, activationEvent?: string): boolean {
        const rules = plugin?.manifest?.activationEvents ?? [];

        if (rules.length === 0 || activationEvent == `onView:${plugin.pluginId}`) {
            return true;
        }
        if (!activationEvent) {
            return false;
        }

        return rules.some((rule) => activationEventMatches(rule, activationEvent));
    }

    /**
     * 校验激活事件并激活插件
     */
    private async ensurePluginReady(idOrEntity: string | PluginEntry, activationEvent?: string): Promise<void> {
        const current = typeof idOrEntity == 'string' ? this.deps.pluginRuntimeCatalogService.getPluginEntryById(idOrEntity) : idOrEntity;

        if (!current) {
            throw new Error(`Plugin not found: ${idOrEntity}`);
        }

        if (isDisabled(current)) {
            throw new Error(`Plugin "${current.pluginId}" is disabled`);
        }

        if (!isActivated(current)) {
            if (!this.canActivateByEvent(current, activationEvent)) {
                const trigger = activationEvent ?? '<none>';
                throw new Error(`Plugin "${current.pluginId}" is not configured for activation event: ${trigger}`);
            }

            await this.deps.pluginRuntimeCatalogService.activatePlugin(current.pluginId);
        }

        if (!this.activatedFrontendWorkerIds.has(current.pluginId)) {
            await this.deps.workerSandboxService.activate(current.pluginId);
            this.activatedFrontendWorkerIds.add(current.pluginId);
        }
    }

    // 尝试找到第一个可以激活视图的插件来显示视图
    private resolveActivePluginId(plugins: PluginEntry[], preferredPluginId: string | null): string | null {
        const currentPlugin = preferredPluginId ? plugins.find((candidate) => candidate.pluginId === preferredPluginId) : null;

        if (currentPlugin && isActivated(currentPlugin) && currentPlugin.viewMeta && !isDisabled(currentPlugin)) {
            return currentPlugin.pluginId;
        }

        const firstActivatedWithView = plugins.find(
            (candidate) => isActivated(candidate) && !!candidate.viewMeta && !isDisabled(candidate)
        );
        if (firstActivatedWithView?.viewMeta) {
            return firstActivatedWithView.pluginId;
        }

        const firstViewPlugin = plugins.find((candidate) => candidate.viewMeta && !isDisabled(candidate));
        return firstViewPlugin?.pluginId ?? null;
    }

    private async refreshAll(): Promise<void> {
        const pluginEntries = await this.deps.pluginRuntimeCatalogService.getAllPluginEntry();

        this.patch({
            plugins: pluginEntries,
            activeViewPluginId: null,
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
