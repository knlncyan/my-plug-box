# Core 运行时说明（前端）

本文档用于帮助你快速理解当前 `src/core` 架构与命令执行链路。

## 1. 核心分层

1. 协议层（`src/domain`）
- 定义插件、运行时、Worker、视图桥接协议类型。

2. 核心层（`src/core`）
- IoC 装配（`index.ts`）
- 能力注册中心（`CapabilityRegistry.ts`）
- 资源与激活工具（`utils/`）
- Worker 入口（`sandbox/worker.ts`）
- React Hook（`useCoreRuntime.ts`）

3. 服务层（`src/core/service`）
- 目录注册：`PluginAssetCatalogService`
- 激活策略：`PluginActivationService`
- 命令调度：`PluginCommandService`
- 视图状态：`PluginViewService`
- 设置/存储：`PluginSettingService`、`PluginStorageService`
- Worker 沙箱：`WorkerSandboxService`
- 总编排：`PluginRuntimeService`

## 2. 启动流程

入口：`useCoreRuntime` -> `coreRuntime.initialize()`

`PluginRuntimeService.initialize()` 主要步骤：

1. 校验内置插件 manifest 与模块导出一致性。
2. 注册内置插件元数据到 Rust 端。
3. 启动插件状态监听。
4. 拉取插件/视图/命令目录快照。
5. 激活 `onStartup` 插件。
6. 同步 Worker 激活状态。
7. 订阅后端事件并持续刷新快照。

## 3. 命令执行流程

1. UI 调用 `executeCommand(commandId)`。
2. `PluginRuntimeService` 转发到 `PluginCommandService`。
3. `PluginCommandService` 检查命令存在、做循环检测。
4. 目标插件未激活时，按激活策略激活插件并激活对应 Worker。
5. 命令通过 `WorkerSandboxService` 转发到目标插件 Worker。
6. Worker 加载插件模块并执行对应 handler。
7. handler 调用宿主能力时，通过 `worker-request(method+params)` 回到主线程。

## 4. 沙箱模型

1. 命令沙箱
- 每个插件一个 Worker（隔离执行上下文）。

2. 视图沙箱
- 每个视图在 iframe 内渲染。
- 通过 postMessage 与主线程 runtime 桥接。

## 5. 能力注册表

`CapabilityRegistry` 由 IoC 管理，并从 `src/core/index.ts` 导出：

- `registerCapability(capabilityId, factory)`
- `capabilityRegistry`

插件 API 调用方式：

- `api.call(method, params)`：通用 RPC
- `api.get('xxx')`：能力对象调用（更适合类型提示）

## 6. 关键入口文件

- `src/core/index.ts`：依赖注入装配中心
- `src/core/service/PluginRuntimeService.ts`：运行时总编排
- `src/core/service/PluginCommandService.ts`：命令执行与激活链路
- `src/core/service/WorkerSandboxService.ts`：Worker 与宿主桥接
- `src/core/sandbox/worker.ts`：插件 Worker 执行入口
- `src/ui/plugin/PluginRenderer.tsx`：插件视图 iframe 渲染与桥接

## 7. 阅读顺序建议

1. `src/core/index.ts`
2. `src/core/service/PluginRuntimeService.ts`
3. `src/core/service/PluginCommandService.ts`
4. `src/core/service/WorkerSandboxService.ts`
5. `src/core/sandbox/worker.ts`
6. `src/core/useCoreRuntime.ts`
7. `src/ui/plugin/PluginRenderer.tsx`
