# Plug-Box 插件开发工具（最小版）

这个工具用于快速创建“外部插件”项目，并提供统一 SDK 类型与自动打包结构。

## 功能

1. `init`：创建插件项目目录（React 或 Vue）。
2. `build`：自动输出可安装结构（`index.js`、`view/index.js`、`plugin.json`、`icon.*`）。
3. 视图模块可直接 `import { createPluginApi } from '@plug-box/plugin-sdk'`，不需要手写 postMessage 桥接。

## 创建项目

```bash
node tools/plugin-devtool/bin/plugbox-plugin.mjs init my-notes-plugin --framework react
# 或
node tools/plugin-devtool/bin/plugbox-plugin.mjs init my-notes-plugin --framework vue
```

## 构建插件

```bash
cd my-notes-plugin
pnpm install
pnpm build
```

构建后输出目录：`dist/<pluginId>/`

- `dist/<pluginId>/index.js`
- `dist/<pluginId>/view/index.js`
- `dist/<pluginId>/plugin.json`
- `dist/<pluginId>/icon.svg`（如果配置了 icon）
- 其他打包产物（如 `assets/`）

说明：`dist/<pluginId>` 是自包含产物，不依赖宿主的 `public/plugin-sdk` 目录。

## 安装到主应用

将 `dist/<pluginId>` 目录内容复制到：

`<app-root>/public/plugins/<plugin-id>/`

然后在应用内执行插件刷新 API（或重启应用）。

## 配置文件

每个插件项目包含 `plugbox.config.json`，用于生成最终 `plugin.json`。

关键字段：

- `pluginId`
- `name`
- `version`
- `activationEvents`
- `commands`
- `view`
- `entries.module`
- `entries.view`
- `entries.icon`
- `outDir`

## 视图入口规则（必须）

1. 视图入口路径由 `plugbox.config.json` 的 `entries.view` 决定，不强制必须是 `src/view/index.tsx`。
2. 视图入口模块必须 `default export` 一个可渲染组件。
3. React 项目可用 `tsx`，Vue 项目可用 `vue`，最终都会打包为 `dist/<pluginId>/view/index.js`。
4. 视图里调用宿主能力请使用 SDK：`createPluginApi()` + `api.call/api.get`。
5. 视图运行在浏览器沙箱中，不可使用 Node.js API（如 `fs`、`path`、`process`）。

示例（React 视图）：

```ts
import { createPluginApi } from '@plug-box/plugin-sdk';

export default function MyView() {
  async function run() {
    const api = await createPluginApi();
    await api.call('command.execute', {
      commandId: 'external.demo.open',
      args: [],
    });
  }

  return <button onClick={run}>Run</button>;
}
```

## 常见错误

- `Component default export missing`：
  视图入口没有默认导出组件。
- `JSX.IntrinsicElements` 报错：
  通常是 TypeScript 配置被错误覆盖，优先使用脚手架默认 `tsconfig.json`。
- 能构建但视图空白：
  先检查 `plugin.json` 的 `viewUrl`，再检查入口是否真的导出了组件。

## 说明

- `src/index.ts`（逻辑模块）继续使用 `context.api` 风格。
- `src/view/*`（视图模块）推荐使用 `createPluginApi()` 统一调用。
- 本工具是最小可用版，默认只提供 build，不提供运行态预览。
