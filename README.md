# ModuDesk

一个基于 `Tauri 2 + React 19 + TypeScript + Vite` 的桌面插件宿主项目。

当前仓库重点在于提供一套可运行的插件工作台：前端负责插件界面、命令面板和快捷键管理，Rust 后端负责插件扫描、运行时状态、设置持久化和存储持久化。

## 项目概览

- 前端入口链路：`src/main.tsx` -> `src/App.tsx` -> `src/ui/index.tsx`
- 前端核心运行时：`src/core/`
- Rust 后端入口：`src-tauri/src/lib.rs`
- Rust 命令模块：`src-tauri/src/commands/`
- 仓库包管理器：`pnpm`

当前 UI 已经包含这些可见能力：

- 插件列表与状态展示
- 命令面板
- 快捷键管理页面
- 插件管理入口（当前页面组件仍为空实现）
- 桌面托盘与全局快捷键集成

## 当前架构

### 前端

- `src/ui/`：工作台布局、侧边栏、主内容区，以及命令面板、快捷键、插件管理等页面
- `src/core/`：插件运行时、IoC 装配、Worker/视图沙箱桥接、能力注册与状态管理
- `src/api/`：调用 Tauri `invoke` 命令的前端服务层
- `src/domain/`：插件协议、运行时状态、能力相关类型定义
- `src/lib/`：生命周期与通用基础设施

### 核心服务

`src/core/service/` 当前实际包含以下服务：

- `PluginRuntimeCatalogService`：从后端拉取插件运行时列表，并维护插件与命令索引
- `PluginRuntimeService`：负责运行时启动、刷新、激活视图和执行命令
- `WorkerSandboxService`：管理插件 Worker，并处理 Worker/宿主之间的能力调用
- `PluginSettingService`：管理插件设置读写
- `PluginStorageService`：管理插件私有存储
- `CommandShortcutService`：管理快捷键列表与命令分发

`src/core/index.ts` 负责 IoC 容器装配，并导出 `registerCapability(...)` 用于注册宿主能力。

### 沙箱模型

- 命令执行沙箱：每个插件按需使用独立 Worker 执行命令逻辑
- 视图渲染沙箱：插件视图通过 iframe 加载 `plugin-view-sandbox.html`，由 `src/core/PluginRenderer.tsx` 负责桥接

这意味着命令执行环境和视图渲染环境是隔离的：前者在 Worker，后者在 iframe。

### Rust 后端

`src-tauri/src/commands/` 当前包含四类命令：

- `plugin_index_commands.rs`：刷新外部插件索引
- `plugin_runtime_commands.rs`：获取运行时列表、激活/反激活/停用插件
- `plugin_persistence_commands.rs`：插件设置与存储持久化
- `shortcut_commands.rs`：快捷键查询、更新与重置

这些命令统一在 `src-tauri/src/lib.rs` 中注册到 Tauri 的 `invoke_handler`。

## 快速开始

安装依赖：

```bash
pnpm install
```

启动前端开发服务器：

```bash
pnpm dev
```

启动 Tauri 桌面开发环境：

```bash
pnpm tauri dev
```

构建前端产物：

```bash
pnpm build
```

预览前端产物：

```bash
pnpm preview
```

构建桌面应用：

```bash
pnpm tauri build
```

说明：仓库使用 `pnpm`，但 `src-tauri/tauri.conf.json` 当前的 `beforeDevCommand` 和 `beforeBuildCommand` 仍写的是 `npm run dev` / `npm run build`。如果你调整包管理器策略，请同步更新这部分配置。

## 插件加载说明

Rust 端当前会扫描应用数据目录下的 `plugins` 子目录，逻辑位于 `src-tauri/src/core/plugin_index_utils.rs`。

默认约定如下：

- 插件目录：`<app_data_dir>/plugins/<plugin-folder>/`
- 清单文件：`plugin.json`
- 命令模块默认入口：`index.js`
- 视图模块默认入口：`view/index.js`

如果 `plugin.json` 中显式提供了 `moduleUrl` 或 `viewUrl`，后端会把这些路径按应用数据目录进行归一化处理；如果没有提供，则回退到默认入口文件名。

仓库里也提供了一组示例插件资源，可参考 `public/plugins/` 下的目录结构，例如：

- `public/plugins/external.calculator/`
- `public/plugins/external.hello/`
- `public/plugins/external.my-plugin/`
- `public/plugins/external.notes/`
- `public/plugins/external.text-tools/`

需要注意的是，`public/plugins/` 是仓库中的示例资源目录；运行时实际扫描入口仍以后端代码中的应用数据目录为准，两者不是同一个概念。

当前仓库里没有看到把 `public/plugins/*` 自动复制到 `<app_data_dir>/plugins/` 的逻辑，所以这些示例不会因为存在于仓库中就被运行时自动发现。若要验证外部插件加载流程，需要手动把插件目录放到后端实际扫描的位置。

## 目录参考

```text
src/
  App.tsx
  main.tsx
  api/
  core/
    index.ts
    PluginRenderer.tsx
    sandbox/
      PluginViewHost.tsx
      worker.ts
    service/
      CommandShortcutService.ts
      PluginRuntimeCatalogService.ts
      PluginRuntimeService.ts
      PluginSettingService.ts
      PluginStorageService.ts
      WorkerSandboxService.ts
  domain/
  lib/
  ui/
    index.tsx
    layout/
    pages/
      commandPalette/
      keyboardShortcuts/
      pluginManager/
      settingCenter/

src-tauri/
  src/
    commands/
    core/
    utils/
```

## 文档

仓库中当前可见的辅助文档包括：

- `docs/plugin-json.zh-CN.md`
- `docs/plugin-development.zh-CN.md`
- `docs/external-plugin-packaging.zh-CN.md`
- `docs/core-runtime.zh-CN.md`
- `docs/xxx.md`

不过这些文档不一定已经完全跟上当前实现。阅读插件系统与运行时行为时，建议优先以这些代码位置为准：

- `package.json`
- `src/core/index.ts`
- `src/core/service/*`
- `src/core/PluginRenderer.tsx`
- `plugin-view-sandbox.html`
- `src-tauri/src/commands/*`
- `src-tauri/src/core/plugin_index_utils.rs`
- `src-tauri/src/lib.rs`

如果 README、辅助文档和代码实现不一致，请以代码为准。
