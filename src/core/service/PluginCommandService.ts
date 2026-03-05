/**
 * 命令执行服务：
 * 1) 维护命令目录缓存。
 * 2) 处理执行链路（按需激活、循环检测、Worker 转发）。
 */
import service from '../../api/plugin.service';
import type { CommandMeta } from '../../domain/protocol/plugin-catalog.protocol';
import type { ExecuteCommandPipelineOptions } from '../../domain/runtime';
import { PluginActivationService } from './PluginActivationService';
import { PluginViewService } from './PluginViewService';
import { WorkerSandboxService } from './WorkerSandboxService';

interface PluginCommandServiceDeps {
    pluginActivationService: PluginActivationService;
    workerSandboxService: WorkerSandboxService;
    pluginViewService: PluginViewService;
}

export class PluginCommandService {
    private readonly commands = new Map<string, CommandMeta>();
    private loadPromise: Promise<void> | null = null;

    constructor(private readonly deps: PluginCommandServiceDeps) { }

    /**
     * 用最新命令目录覆盖本地缓存。
     */
    setCommandCatalog(commands: CommandMeta[]): void {
        this.commands.clear();
        for (const command of commands) {
            this.commands.set(command.id, command);
        }
    }

    private ensureLoaded(): Promise<void> {
        if (!this.loadPromise) {
            this.loadPromise = this.loadCommands();
        }
        return this.loadPromise;
    }

    private async loadCommands(): Promise<void> {
        const data = await service.listCommands();
        this.setCommandCatalog(data);
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

        const ownerPluginId = commandMeta.plugin_id;
        if (!this.deps.pluginActivationService.isPluginActivated(ownerPluginId)) {
            if (!this.deps.pluginActivationService.canActivateForCommand(ownerPluginId, commandId)) {
                throw new Error(
                    `Plugin "${ownerPluginId}" is not configured for command activation: ${commandId}`
                );
            }
            await this.deps.pluginActivationService.activatePluginWithHooks(ownerPluginId);
            await this.deps.workerSandboxService.activate(ownerPluginId);
        }

        const result = await this.deps.workerSandboxService.executeCommand(
            ownerPluginId,
            commandId,
            args,
            nextTrace
        );

        // 命令返回 viewId 时，自动切换目标视图。
        if (typeof result === 'string' && options.activateView && this.deps.pluginViewService.hasView(result)) {
            options.activateView(result);
        }

        return result;
    }
}
