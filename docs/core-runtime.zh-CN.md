# Core 运行时说明（前端）

本文档用于帮助你快速理解 `src/core` + `src/service` 的当前实现。

## 1. 核心分层

1. 协议层（`src/domain`）
- 定义插件、运行时、Worker、视图桥接协议类型。

2. 核心层（`src/core`）
- IoC 装配（`index.ts`）
- 宿主 API 聚合（`PluginApiRegistry.ts`）
- 能力注册中心（`CapabilityRegistry.ts`）
- Worker 入口（`worker.ts`）
- React Hook（`useCoreRuntime.ts`）

3. 服务层（`src/service`）
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

1. 注册内置插件元数据到 Rust 端。
2. 启动插件状态监听。
3. 拉取插件/视图/命令目录快照。
4. 激活 `onStartup` 插件。
5. 同步前端 Worker 激活状态。
6. 订阅后端事件并持续刷新快照。

## 3. 命令执行流程

1. UI 调用 `executeCommand(commandId)`。
2. `PluginCommandService` 检查命令存在、做循环检测。
3. 如目标插件未激活，按激活策略按需激活。
4. 命令通过 `WorkerSandboxService` 转发到目标插件 Worker。
5. Worker 中加载插件模块并执行对应 handler。
6. handler 需要宿主能力时，通过 `worker-request(method+params)` 回调主线程。

## 4. 沙箱模型

1. 命令沙箱
- 每个插件一个 Worker（隔离执行上下文）。

2. 视图沙箱
- 每个视图在 iframe 内渲染。
- 通过 postMessage 从主线程获取运行时快照与调用能力。

## 5. 能力注册表

`CapabilityRegistry` 由 IoC 管理，并从 `src/core/index.ts` 导出：

- `registerCapability(capabilityId, factory)`
- `capabilityRegistry`

能力调用有两种形式：

- `api.capabilities.call(method, params)`：通用 RPC
- `api.capabilities.get('xxx')`：能力对象调用（更适合类型提示）

## 6. 关键入口文件

- `src/core/index.ts`：依赖注入装配中心
- `src/service/PluginRuntimeService.ts`：运行时总编排
- `src/service/WorkerSandboxService.ts`：Worker 与宿主桥接
- `src/core/worker.ts`：插件 Worker 执行入口
- `src/ui/plugin/PluginRenderer.tsx`：插件视图 iframe 渲染与桥接

## 7. 阅读顺序建议

1. `src/core/index.ts`
2. `src/service/PluginRuntimeService.ts`
3. `src/service/PluginCommandService.ts`
4. `src/service/WorkerSandboxService.ts`
5. `src/core/worker.ts`
6. `src/core/useCoreRuntime.ts`
7. `src/ui/plugin/PluginRenderer.tsx`
