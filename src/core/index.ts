import { SimpleContainer } from './ioc/SimpleContainer';
import { PluginRuntimeCatalogService } from './service/PluginRuntimeCatalogService';
import { PluginRuntimeService } from './service/PluginRuntimeService';
import { PluginSettingService } from './service/PluginSettingService';
import { PluginStorageService } from './service/PluginStorageService';
import { WorkerSandboxService } from './service/WorkerSandboxService';
import { CommandKeybindingService } from './service/CommandKeybindingService';
import type { CapabilityById, CapabilityFactory } from '../domain/capability';
import { CapabilityRegistry } from './CapabilityRegistry';
import { PluginDisposable } from './PluginDisposable';
import { PluginEventBus } from './PluginEventBus';

/**
 * Core 入口：
 * 1) 负责 IoC 容器装配。
 * 2) 导出运行时服务入口（coreRuntime + useCoreRuntime）。
 */
export const container = new SimpleContainer();

container.registerSingleton(PluginEventBus, () => new PluginEventBus());
container.registerSingleton(PluginDisposable, () => new PluginDisposable());
container.registerSingleton(CapabilityRegistry, () => new CapabilityRegistry());
container.registerSingleton(PluginRuntimeCatalogService, () => new PluginRuntimeCatalogService());
container.registerSingleton(
    PluginSettingService,
    () => new PluginSettingService(container.resolve(PluginEventBus))
);
container.registerSingleton(PluginStorageService, () => new PluginStorageService());
container.registerSingleton(
    CommandKeybindingService,
    () =>
        new CommandKeybindingService({
            pluginSettingService: container.resolve(PluginSettingService),
        })
);

container.registerSingleton(
    WorkerSandboxService,
    () =>
        new WorkerSandboxService({
            capabilityRegistry: container.resolve(CapabilityRegistry),
            pluginRuntimeCatalogService: container.resolve(PluginRuntimeCatalogService),
            pluginEventBus: container.resolve(PluginEventBus),
            pluginDisposable: container.resolve(PluginDisposable),
            pluginStorageService: container.resolve(PluginStorageService),
            pluginSettingService: container.resolve(PluginSettingService),
        })
);

container.registerSingleton(
    PluginRuntimeService,
    () =>
        new PluginRuntimeService({
            pluginRuntimeCatalogService: container.resolve(PluginRuntimeCatalogService),
            workerSandboxService: container.resolve(WorkerSandboxService),
            // commandKeybindingService: container.resolve(CommandKeybindingService),
            pluginDisposable: container.resolve(PluginDisposable),
        })
);

const capabilityRegistry = container.resolve(CapabilityRegistry);

export function registerCapability<K extends string>(
    capabilityId: K,
    factory: CapabilityFactory<CapabilityById<K>>
): () => void {
    return capabilityRegistry.register(capabilityId, factory);
}

export { useCoreRuntime } from './useCoreRuntime';

export type { ExecuteCommandOptions, PluginRuntimeSnapshot } from '../domain/runtime';
export type { CapabilityContext, CapabilityContract, CapabilityFactory, CapabilityById } from '../domain/capability';
