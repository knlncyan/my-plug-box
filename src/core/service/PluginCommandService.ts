// /**
//  * 命令执行服务：
//  * 1) 维护命令目录缓存。
//  * 2) 处理执行链路（激活检查、循环检测、Worker 转发）。
//  */
// import service from '../../api/plugin.service';
// import type { CommandMeta, PluginEntry } from '../../domain/protocol/plugin-catalog.protocol';
// import type { ExecuteCommandPipelineOptions } from '../../domain/runtime';
// import { isActivated, isDisabled } from '../utils/pluginUtils';
// import { PluginAssetCatalogService } from './PluginAssetCatalogService';
// import { WorkerSandboxService } from './WorkerSandboxService';

// interface PluginCommandServiceDeps {
//     workerSandboxService: WorkerSandboxService;
//     pluginAssetCatalogService: PluginAssetCatalogService
// }

// type PluginActivator = (pluginId: string, activationEvent?: string) => Promise<void>;



// export class PluginCommandService {
//     private readonly commands = new Map<string, CommandMeta>();
//     private readonly plugins = new Map<string, PluginEntry>();
//     private loadPromise: Promise<void> | null = null;
//     private pluginActivator: PluginActivator | null = null;

//     constructor(private readonly deps: PluginCommandServiceDeps) { }

//     /**
//      * 注入“确保插件可执行”的激活器（由运行时服务提供）。
//      */
//     setPluginActivator(activator: PluginActivator): void {
//         this.pluginActivator = activator;
//     }

//     /**
//      * 用最新命令目录覆盖本地缓存。
//      */
//     setCommandCatalog(commands: CommandMeta[]): void {
//         this.commands.clear();
//         for (const command of commands) {
//             this.commands.set(command.id, command);
//         }
//     }

//     /**
//      * 用后端返回的最新插件状态覆盖本地缓存。
//      */
//     setPluginCatalog(plugins: PluginEntry[]): void {
//         this.plugins.clear();
//         for (const plugin of plugins) {
//             this.plugins.set(plugin.id, plugin);
//         }
//     }

//     private ensureLoaded(): Promise<void> {
//         if (!this.loadPromise) {
//             this.loadPromise = this.loadCommands();
//         }
//         return this.loadPromise;
//     }

//     private async loadCommands(): Promise<void> {
//         const req = await service.listCommands();
//         this.setCommandCatalog(req.data ?? []);
//     }

//     async executeCommand(
//         commandId: string,
//         options: ExecuteCommandPipelineOptions,
//         ...args: unknown[]
//     ): Promise<unknown> {
//         await this.ensureLoaded();

//         const commandMeta = this.commands.get(commandId);
//         if (!commandMeta) {
//             throw new Error(`Command not found: ${commandId}`);
//         }

//         // 命令链路防循环：A -> B -> A。
//         const trace = options.trace ?? [];
//         if (trace.includes(commandId)) {
//             const chain = [...trace, commandId].join(' -> ');
//             throw new Error(`Detected command cycle: ${chain}`);
//         }
//         const nextTrace = [...trace, commandId];

//         const ownerPluginId = commandMeta.pluginId;
//         const ownerPlugin = this.plugins.get(ownerPluginId);
//         if (isDisabled(ownerPlugin)) {
//             throw new Error(`Plugin "${ownerPluginId}" is disabled`);
//         }

//         if (!isActivated(ownerPlugin)) {
//             if (!this.pluginActivator) {
//                 throw new Error('Plugin activator not configured');
//             }
//             await this.pluginActivator(ownerPluginId, `onCommand:${commandId}`);
//         }

//         const result = await this.deps.workerSandboxService.executeCommand(
//             ownerPluginId,
//             commandId,
//             args,
//             nextTrace
//         );

//         // 仅当返回值是已知插件 ID 或已知视图 ID 时，才执行视图切换。
//         if (typeof result === 'string' && options.activateView) {
//             const target = result.trim();
//             const isKnownPluginId = this.plugins.has(target);
//             const isKnownViewId = Array.from(this.plugins.values()).some((plugin) => plugin.pluginId === target);
//             if (target.length > 0 && (isKnownPluginId || isKnownViewId)) {
//                 options.activateView(target);
//             }
//         }

//         return result;
//     }
// }
