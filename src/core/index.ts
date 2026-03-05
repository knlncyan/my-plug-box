import { SimpleContainer } from './ioc/SimpleContainer';
import { PluginActivationService } from './service/PluginActivationService';
import { PluginAssetCatalogService } from './service/PluginAssetCatalogService';
import { PluginCommandService } from './service/PluginCommandService';
import { PluginRuntimeService } from './service/PluginRuntimeService';
import { PluginSettingService } from './service/PluginSettingService';
import { PluginStorageService } from './service/PluginStorageService';
import { PluginViewService } from './service/PluginViewService';
import { WorkerSandboxService } from './service/WorkerSandboxService';
import type { CapabilityById, CapabilityFactory } from '../domain/capability';
import { CapabilityRegistry } from './CapabilityRegistry';
import { PluginDisposable } from './PluginDisposable';
import { PluginEventBus } from './PluginEventBus';

/**
 * Core 入口：
 * 1) 负责 IoC 容器装配。
 * 2) 导出运行时服务入口（coreRuntime + useCoreRuntime）。
 */
const container = new SimpleContainer();

// 事件总线：插件事件发布/订阅
container.registerSingleton(PluginEventBus, () => new PluginEventBus());

// 资源清理器：统一管理插件和全局可释放资源
container.registerSingleton(PluginDisposable, () => new PluginDisposable());

// 能力注册中心：统一管理插件可调用的宿主能力
container.registerSingleton(CapabilityRegistry, () => new CapabilityRegistry());

// 插件目录服务：加载内置 manifest 并注册到后端
container.registerSingleton(PluginAssetCatalogService, () => new PluginAssetCatalogService());

// 视图状态服务：维护视图目录与当前激活视图
container.registerSingleton(PluginViewService, () => new PluginViewService());

// 设置服务：插件设置读取与持久化
container.registerSingleton(
    PluginSettingService,
    () => new PluginSettingService(container.resolve(PluginEventBus))
);

// 存储服务：插件私有数据读取与持久化
container.registerSingleton(PluginStorageService, () => new PluginStorageService());

// 激活服务：激活规则判断与状态同步
container.registerSingleton(
    PluginActivationService,
    () => new PluginActivationService(container.resolve(PluginDisposable))
);

// Worker 沙箱服务：每个插件独立 Worker 隔离执行
container.registerSingleton(
    WorkerSandboxService,
    () =>
        new WorkerSandboxService({
            capabilityRegistry: container.resolve(CapabilityRegistry),
            pluginActivationService: container.resolve(PluginActivationService),
            pluginEventBus: container.resolve(PluginEventBus),
            pluginDisposable: container.resolve(PluginDisposable),
            pluginStorageService: container.resolve(PluginStorageService),
            pluginSettingService: container.resolve(PluginSettingService),
        })
);

// 命令服务：命令目录缓存、循环检测与调度
container.registerSingleton(
    PluginCommandService,
    () =>
        new PluginCommandService({
            pluginActivationService: container.resolve(PluginActivationService),
            workerSandboxService: container.resolve(WorkerSandboxService),
            pluginViewService: container.resolve(PluginViewService),
        })
);

// 运行时编排服务
container.registerSingleton(
    PluginRuntimeService,
    () =>
        new PluginRuntimeService({
            pluginAssetCatalogService: container.resolve(PluginAssetCatalogService),
            pluginActivationService: container.resolve(PluginActivationService),
            pluginCommandService: container.resolve(PluginCommandService),
            pluginViewService: container.resolve(PluginViewService),
            workerSandboxService: container.resolve(WorkerSandboxService),
            pluginDisposable: container.resolve(PluginDisposable),
        })
);

// 非 React 场景使用
export const coreRuntime = container.resolve(PluginRuntimeService);

// 能力注册入口（IoC 托管）
export const capabilityRegistry = container.resolve(CapabilityRegistry);
export function registerCapability<K extends string>(
    capabilityId: K,
    factory: CapabilityFactory<CapabilityById<K>>
): () => void {
    return capabilityRegistry.register(capabilityId, factory);
}

// React Hook 入口
export { useCoreRuntime } from './useCoreRuntime';

export type { ExecuteCommandOptions, PluginRuntimeSnapshot } from '../domain/runtime';
export type {
    CapabilityContext,
    CapabilityContract,
    CapabilityFactory,
    CapabilityById,
} from '../domain/capability';
