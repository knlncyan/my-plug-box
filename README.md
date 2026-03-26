# plug-box

一个基于 **Tauri 2 + React 19 + TypeScript** 的桌面插件系统示例项目。

当前版本重点：

- Rust 端负责插件元数据、生命周期状态与持久化。
- 前端负责运行时编排、命令调度、Worker/视图沙箱与 UI 渲染。
- 通过能力注册表（Capability Registry）扩展插件可调用宿主能力。
- 支持外部插件：public/plugins/manifest.json 中列出的插件包由 plugin.json、打包好的 index.js 与视图 bundle（view/index.*）组成，文档 docs/external-plugin-packaging.zh-CN.md 与 docs/plugin-development.zh-CN.md 说明如何打包并写入 manifest。

## 架构概览

- `src-tauri/`：后端插件管理、持久化、Tauri 命令。
- `src/core/`：IoC 装配、运行时服务、Worker/视图沙箱桥接、核心工具。
- `src/core/service/`：激活、目录注册、命令执行、设置/存储、Worker 沙箱、运行时编排。
- `src/core/utils/`：激活规则工具、插件资源加载工具。
- `src/domain/`：协议与领域类型定义。
- `src/ui/`：宿主界面布局与插件视图渲染器。
- `src/plugins/`：内置插件（`welcome`、`command-palette`）。

## 关键设计

1. `IoC 容器统一装配`
- 入口：`src/core/index.ts`
- 统一注入 `PluginRuntimeService`、`WorkerSandboxService`、`CapabilityRegistry` 等核心服务。

2. `双沙箱模型`
- 命令执行沙箱：每插件独立 Worker（`src/core/sandbox/worker.ts`）。
- 视图渲染沙箱：每插件视图独立 iframe（`src/ui/plugin/PluginRenderer.tsx` + `src/core/sandbox/pluginViewHost.tsx`）。

3. `通用能力调用协议`
- Worker -> Host 使用 `method + params` 协议（`src/domain/worker.ts`）。
- 插件 API 使用：
  - `api.call(method, params)`
  - `api.get('capabilityId')`

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
    useCoreRuntime.ts
    CapabilityRegistry.ts
    PluginDisposable.ts
    PluginEventBus.ts
    ioc/
      SimpleContainer.ts
    service/
      PluginRuntimeService.ts
      PluginCommandService.ts
      WorkerSandboxService.ts
      PluginActivationService.ts
      PluginAssetCatalogService.ts
      PluginSettingService.ts
      PluginStorageService.ts
      PluginViewService.ts
    sandbox/
      worker.ts
      pluginViewHost.tsx
    utils/
      activateEventsUtils.ts
      PluginResourceLoader.ts
  domain/
    api.ts
    capability.ts
    runtime.ts
    worker.ts
    protocol/
  ui/
    layout/WorkbenchLayout.tsx
    plugin/PluginRenderer.tsx
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

- 插件清单规范（中文）：docs/plugin-json.zh-CN.md
- 插件开发手册（中文）：docs/plugin-development.zh-CN.md
- 外部插件打包指南（中文）：docs/external-plugin-packaging.zh-CN.md
- Core 运行时说明（中文）：docs/core-runtime.zh-CN.md
- 能力注册表示例：docs/xxx.md

## 说明

如文档与代码冲突，以 `src/core/index.ts` 的注入关系与 `src/core/service/*` 的实现为准。
