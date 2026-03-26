# 外部插件打包指南（中文）

本文档说明如何将外部插件打包成宿主可识别的 bundle。

## 1. 目录结构

在 `public/plugins/<pluginId>/` 下准备：

- `plugin.json`（与内置插件结构一致，可选地携带 `moduleUrl`/`viewUrl`）。
- 打包好的 `index.js`（命令逻辑），可以使用 React/Vue + 任意打包器。
- `view/index.js`（视图逻辑）和 `view/index.css`（样式），打包器需要把引用的依赖一并打包。视图代码会运行在 iframe 沙箱内。

## 2. 打包要求

1. Worker 直接引用 `index.js`，建议输出 ES 模块，确保运行时环境支持 `import`。
2. 视图 bundle 由 `view/index.js` 提供，建议使用现代打包器（Vite/webpack/Rollup）输出，包装好 React/Vue 运行时代码。
3. CSS 可直接在视图 bundle 中 `import './index.css'`，也可通过 `<link>` 引入。

## 3. Manifest 绑定

在 `public/plugins/manifest.json` 中注册插件：

```json
[
  {
    "id": "external.demo",
    "moduleUrl": "/plugins/external.demo/index.js",
    "viewUrl": "/plugins/external.demo/view/index.js"
  }
]
```

插件启动时，前端会读取 manifest，调用 `PluginAssetCatalogService` 注册命令与视图，再由 Worker 通过 `moduleUrl` 动态导入逻辑。

## 4. 运行时提示

- `moduleUrl` 必须可被 host 页访问，可以是相对路径或 CDN 地址。
- `viewUrl` 为空时，插件视图默认回退到内置加载方式。
- 外部插件会和内置插件共享命令/视图 ID，发布前请确认 ID 唯一。

> 可选：你可以提供 `build.sh` 脚本，自动复制产物到 `public/plugins/<pluginId>` 并更新 manifest。
