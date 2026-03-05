# plug-box

一个基于 **Tauri 2 + React 19 + TypeScript** 的桌面插件系统示例项目。

当前版本重点是：

- Rust 端负责插件元数据与生命周期状态。
- 前端负责运行时编排、命令调度、沙箱隔离、UI 渲染。
- 通过能力注册表（Capability Registry）扩展插件可调用的宿主能力。

## 架构概览

- `src-tauri/`：后端插件管理与持久化能力。
- `src/core/`：IoC 装配、API 聚合、Worker 入口、运行时 Hook。
- `src/service/`：激活、目录注册、命令执行、设置/存储、Worker 沙箱等核心服务。
- `src/ui/`：宿主界面布局与插件视图渲染器。
- `src/plugins/`：内置插件（`welcome`、`command-palette`）。

## 关键设计

1. `IoC 容器统一装配`
- 入口：`src/core/index.ts`
- 统一注入 `PluginRuntimeService`、`WorkerSandboxService`、`CapabilityRegistry` 等核心服务。

2. `双沙箱模型`
- 命令执行沙箱：每插件独立 Worker（`src/core/worker.ts`）。
- 视图渲染沙箱：每插件视图独立 iframe（`src/ui/plugin/PluginRenderer.tsx` + `src/core/sandbox/pluginViewHost.tsx`）。

3. `通用能力调用协议`
- Worker -> Host 使用 `method + params` 协议（`src/domain/worker.ts`）。
- 插件 API 支持：
  - `api.capabilities.call(method, params)`
  - `api.capabilities.get('capabilityId')`

4. `能力注册表`
- `CapabilityRegistry` 由 IoC 管理。
- 业务侧可在任意模块调用 `registerCapability(...)` 注册能力。

## 当前目录（简化）

```text
src/
  api/
    pluginBackend.service.ts
  core/
    index.ts
    CapabilityRegistry.ts
    service/PluginHostApiService.ts
    worker.ts
    useCoreRuntime.ts
  domain/
    api.ts
    capability.ts
    runtime.ts
    worker.ts
    protocol/
  service/
    PluginRuntimeService.ts
    PluginCommandService.ts
    WorkerSandboxService.ts
    ...
  ui/
    layout/WorkbenchLayout.tsx
    plugin/PluginRenderer.tsx
  sandbox/
    pluginViewHost.tsx
  plugins/
    welcome/
    command-palette/

src-tauri/
  src/core/
  src/commands/
```

## 快速开始

```bash
pnpm install
pnpm dev
pnpm tauri dev
```

构建：

```bash
pnpm build
```

## 文档

- 插件清单规范（中文）：`docs/plugin-json.zh-CN.md`
- 插件开发手册（中文）：`docs/plugin-development.zh-CN.md`
- Core 运行时说明（中文）：`docs/core-runtime.zh-CN.md`
- 能力注册表示例：`docs/xxx.md`

## 说明

`README` 只描述当前主干实现。若代码与文档冲突，以 `src/core/index.ts` 注入关系与 `src/service/*` 实现为准。
