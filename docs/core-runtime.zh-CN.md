# Core 结构阅读指南（前端）

本文帮助你快速理解 `src/core` 的设计，并给出一条高效阅读顺序。

## 1. 先建立整体心智模型

`core` 可以拆成三层：

1. 协议层：定义“有哪些对象、消息怎么传”。
2. 编排层：决定“什么时候激活、命令怎么调度”。
3. 执行层：在 Worker 沙箱里真正执行插件逻辑。

你可以先记一句话：

前端只负责编排和渲染，插件逻辑运行在每插件独立 Worker 中，后端（Rust）维护注册状态与元数据。

## 2. 推荐阅读顺序（按理解成本从低到高）

1. `src/core/pluginProtocol.ts`
2. `src/core/pluginWorker.protocol.ts`
3. `src/core/pluginBackend.service.ts`
4. `src/core/pluginRuntime.catalog.ts`
5. `src/core/pluginRuntime.activation.ts`
6. `src/core/pluginRuntime.ts`
7. `src/core/pluginWorkerSandbox.ts`
8. `src/core/pluginModule.worker.ts`
9. `src/core/usePluginRuntime.ts`

这个顺序的核心思路是：

先看数据结构，再看规则，再看主流程，最后看跨线程细节。

## 3. 每个核心文件一句话理解

- `pluginProtocol.ts`：前后端共享类型定义（插件、命令、视图、Host API）。
- `pluginWorker.protocol.ts`：主线程与 Worker 的消息协议。
- `pluginBackend.service.ts`：统一调用 Tauri `invoke`，处理 `ApiResponse` 和拦截器。
- `pluginRuntime.catalog.ts`：注册内置插件的 manifest/view/command 到后端。
- `pluginRuntime.activation.ts`：判断 `onStartup/onCommand/onView` 是否允许激活。
- `pluginRuntime.ts`：运行时总调度器（初始化、激活、命令执行、状态同步）。
- `pluginWorkerSandbox.ts`：每插件一个 Worker 的生命周期与 RPC 桥接。
- `pluginModule.worker.ts`：Worker 入口，加载插件模块并执行 `activate/deactivate/command`。
- `usePluginRuntime.ts`：React Hook，订阅 runtime 快照并暴露动作。

## 4. 最关键的一条命令执行链路

以 `executeCommand('welcome.open')` 为例：

1. UI 调用 `usePluginRuntime().executeCommand(...)`。
2. 进入 `pluginRuntime.executeCommandInternal(...)`。
3. runtime 校验命令存在并做循环检测（防止 A->B->A）。
4. 如果目标插件未激活，按 activationEvents 判定后执行激活。
5. runtime 调用 `pluginWorkerSandbox.executeCommand(...)`。
6. sandbox 把请求发到目标插件 Worker。
7. Worker 中 `pluginModule.worker.ts` 找到命令 handler 并执行。
8. handler 若要调用宿主能力（视图切换、事件、设置、存储、跨插件命令），通过 Worker 协议反向请求主线程。

## 5. 视图激活链路（较简单）

1. UI 调用 `setActiveView(viewId)`。
2. `pluginRuntime` 先更新快照，再 `activateForView(viewId)`。
3. 按 `onView:*` 规则决定是否激活插件。
4. 激活成功后刷新快照，渲染器显示对应视图组件。

## 6. 初始化链路（启动时）

`pluginRuntime.initialize()` 内部主要做：

1. `catalog.registerBuiltins()` 注册元数据到后端。
2. 拉取 `plugins/views/commands` 快照。
3. 激活 `onStartup` 插件。
4. 同步前端 Worker 状态与后端状态。
5. 订阅后端事件（如插件状态变化）。

## 7. 为什么会觉得复杂

复杂点主要有两个：

1. 状态面是双侧的：后端有插件状态，前端也有 Worker 状态。
2. 调用链跨线程：命令执行是主线程 -> Worker，宿主能力是 Worker -> 主线程。

只要按“协议 -> 编排 -> 执行”读，复杂度会明显下降。

## 8. 建议的源码走读方法

1. 先在 `pluginRuntime.ts` 里只看这几个方法：`initialize`、`executeCommandInternal`、`activatePluginWithHooks`。
2. 再跳到 `pluginWorkerSandbox.ts` 看：`ensureWorker`、`executeCommand`、`dispatchWorkerRequest`。
3. 最后看 `pluginModule.worker.ts` 的 `dispatchHostRequest` 和 `createScopedHostApi`。

这样你能先抓住主干，再补细节，不容易迷路。

