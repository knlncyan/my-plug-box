# plug-box

A plugin-driven desktop app based on Tauri + React + TypeScript.

## Current Architecture

- Rust backend is the source of truth for plugin metadata and lifecycle status.
- Frontend runtime is responsible for:
1. registering built-in plugin metadata,
2. activation by strategy (`onStartup`, `onCommand:*`, `onView:*`),
3. command execution dispatch,
4. rendering plugin views,
5. providing PluginHostAPI for plugin modules.

## Tech Stack

- Frontend: React 19, TypeScript, Vite
- Backend: Tauri 2, Rust
- Bridge: Tauri `invoke` + event `listen`

## Docs

- plugin.json 配置文档（中文）：`docs/plugin-json.zh-CN.md`

## Project Structure

```text
src/
  App.tsx
  main.tsx
  pages/
    Layout.tsx
  shell/
    PluginRenderer.tsx
  core/
    plugin-protocol.ts
    pluginBackend.service.ts
    plugin-runtime.ts
    use-plugin-runtime.ts
  plugins/
    index.ts
    welcome/
      plugin.json
      index.ts
      views/
        WelcomeView.tsx
    command-palette/
      plugin.json
      index.ts
      views/
        CommandPaletteView.tsx

src-tauri/
  src/core/
  src/commands/
```

## PluginHostAPI (Implemented)

Plugin module `activate/deactivate` and command handlers now receive a standard API surface:

- `commands.execute(commandId, ...args)`
- `views.activate(viewId)`
- `events.emit(event, payload)` / `events.on(event, handler)`
- `settings.get/set/onChange` (plugin-id namespaced)
- `storage.get/set` (plugin-id isolated local storage)

This enables plugin isolation while still allowing collaboration through exposed commands.

## Command Execution Chain

- UI calls `pluginRuntime.executeCommand(commandId, options, ...args)`.
- Runtime validates metadata and resolves the command handler.
- Runtime performs on-demand activation if required.
- Handler receives `CommandExecutionContext`:
  - `activateView(viewId)`
  - `executeCommand(commandId, ...args)` for cross-plugin orchestration
  - `api` (the plugin's `PluginHostAPI`)

## Activation Strategy

Supported activation events:

- `onStartup`
- `onCommand:<commandId>` / `onCommand:*`
- `onView:<viewId>` / `onView:*`

## Protocol/Error Semantics (Implemented)

Frontend invoke gateway now enforces response semantics:

- `success === true`: pass
- `success === false` and `code === "WARNING"`: only pass when caller explicitly sets `allowWarning`
- other non-success responses: throw error

This prevents silently treating non-warning failures as success and reduces state drift.

## Commands

```bash
pnpm dev
pnpm build
pnpm tauri dev
```

1. `命令可执行链路`（最关键）
- 现状：只有命令元数据注册/查询，没有“执行命令”接口和 handler 调度。
- 证据：[plugin_commands.rs](E:/knln/Desktop/practice/plug-box/src-tauri/src/commands/plugin_commands.rs:31) 只有 `register/get/activate/deactivate`，没有 `execute_command`。
- 影响：插件系统现在更像“元数据目录”，不是完整运行时。

2. `激活策略引擎`
- 现状：manifest 有 `activationEvents`，但 runtime 直接全量 `activateAllPlugins`。
- 证据：[plugin-protocol.ts](E:/knln/Desktop/practice/plug-box/src/core/plugin-protocol.ts:51)、[plugin-runtime.ts](E:/knln/Desktop/practice/plug-box/src/core/plugin-runtime.ts:60)。
- 影响：无法做到按需激活、按命令激活、首次视图激活。

3. `插件 API 能力面（设置/存储/事件/命令调用）`
- 现状：你移除了旧 TS API 后，当前前端没有新的插件调用 API 抽象，只有视图渲染。
- 证据：[PluginRenderer.tsx](E:/knln/Desktop/practice/plug-box/src/shell/PluginRenderer.tsx:9) 仅按 `component_path` 渲染组件。
- 影响：插件内部无法以标准方式访问宿主能力。

4. `协议一致性与错误语义`
- 现状：后端有 `ApiResponse.success/warning`，前端 `invokeApi` 没有检查 `success` 字段。
- 证据：[plugin-backend.ts](E:/knln/Desktop/practice/plug-box/src/core/plugin-backend.ts:10)、[response.rs](E:/knln/Desktop/practice/plug-box/src-tauri/src/core/response.rs:5)。
- 影响：后端返回 warning 时前端可能当成功处理，状态不一致。

5. `唯一性与约束校验（跨插件）`
- 现状：后端重复检查主要是“插件内重复”，不是全局命令 ID / 视图 ID 唯一。
- 证据：[plugin_manager.rs](E:/knln/Desktop/practice/plug-box/src-tauri/src/core/plugin_manager.rs:239)（命令去重在单插件 entry 内）。
- 影响：多插件冲突时行为不确定。

6. `工程级运维能力`
- 包括：插件安装/卸载/升级、签名与权限模型、运行日志与诊断、端到端测试。
- 影响：现在可开发，但离“可发布、可长期维护”的插件生态还差一层。
