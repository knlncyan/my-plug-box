/**
 * 命令执行服务：
 * 1) 维护命令目录缓存。
 * 2) 处理执行链路（激活检查、循环检测、Worker 转发）。
 */
import service from '../../api/plugin.service';
import type { CommandMeta, PluginSummary } from '../../domain/protocol/plugin-catalog.protocol';
import type { ExecuteCommandPipelineOptions } from '../../domain/runtime';
import { WorkerSandboxService } from './WorkerSandboxService';

interface PluginCommandServiceDeps {
    workerSandboxService: WorkerSandboxService;
}

type PluginActivator = (pluginId: string, activationEvent?: string) => Promise<void>;

function statusOf(plugin: PluginSummary | undefined): string {
    return String(plugin?.status ?? '').trim().toLowerCase();
}

function isActivated(plugin: PluginSummary | undefined): boolean {
    return statusOf(plugin) === 'activated';
}

function isDisabled(plugin: PluginSummary | undefined): boolean {
    return statusOf(plugin) === 'disabled';
}

export class PluginCommandService {
    private readonly commands = new Map<string, CommandMeta>();
    private readonly plugins = new Map<string, PluginSummary>();
    private loadPromise: Promise<void> | null = null;
    private pluginActivator: PluginActivator | null = null;

    constructor(private readonly deps: PluginCommandServiceDeps) {}

    /**
     * 注入“确保插件可执行”的激活器（由运行时服务提供）。
     */
    setPluginActivator(activator: PluginActivator): void {
        this.pluginActivator = activator;
    }

    /**
     * 用最新命令目录覆盖本地缓存。
     */
    setCommandCatalog(commands: CommandMeta[]): void {
        this.commands.clear();
        for (const command of commands) {
            this.commands.set(command.id, command);
        }
    }

    /**
     * 用后端返回的最新插件状态覆盖本地缓存。
     */
    setPluginCatalog(plugins: PluginSummary[]): void {
        this.plugins.clear();
        for (const plugin of plugins) {
            this.plugins.set(plugin.id, plugin);
        }
    }

    private ensureLoaded(): Promise<void> {
        if (!this.loadPromise) {
            this.loadPromise = this.loadCommands();
        }
        return this.loadPromise;
    }

    private async loadCommands(): Promise<void> {
        const req = await service.listCommands();
        this.setCommandCatalog(req.data ?? []);
    }

    async executeCommand(
        commandId: string,
        options: ExecuteCommandPipelineOptions,
        ...args: unknown[]
    ): Promise<unknown> {
        await this.ensureLoaded();

        const commandMeta = this.commands.get(commandId);
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
        const ownerPlugin = this.plugins.get(ownerPluginId);
        if (isDisabled(ownerPlugin)) {
            throw new Error(`Plugin "${ownerPluginId}" is disabled`);
        }

        if (!isActivated(ownerPlugin)) {
            if (!this.pluginActivator) {
                throw new Error('Plugin activator not configured');
            }
            await this.pluginActivator(ownerPluginId, `onCommand:${commandId}`);
        }

        const result = await this.deps.workerSandboxService.executeCommand(
            ownerPluginId,
            commandId,
            args,
            nextTrace
        );

        // 命令返回 pluginId 时，自动切换目标插件视图。
        if (typeof result === 'string' && options.activateView) {
            options.activateView(result);
        }

        return result;
    }
}
