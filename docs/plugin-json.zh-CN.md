# plugin.json 配置文档（中文）

本文档说明 `src/plugins/<plugin-folder>/plugin.json` 的配置格式与运行时语义。

## 1. 文件作用

`plugin.json` 是插件清单（Manifest），用于声明：

- 插件基础信息（`id`、`name`、`version`）
- 激活策略（`activationEvents`）
- 视图贡献（`views`）
- 命令贡献（`commands`）
- 外部插件资源定位（`moduleUrl`、`viewUrl`）

前端会读取该文件，并将元数据注册到 Rust 插件管理端。

## 2. 最小示例

```json
{
  "id": "builtin.example",
  "name": "Example",
  "version": "1.0.0"
}
```

## 3. 完整示例

```json
{
  "id": "builtin.welcome",
  "name": "Welcome",
  "version": "1.0.0",
  "description": "Built-in welcome page plugin",
  "activationEvents": ["onView:welcome.main", "onCommand:welcome.open"],
  "view": {
    "id": "welcome.main",
    "title": "Welcome",
    "props": {}
  },
  "commands": [
    {
      "id": "welcome.open",
      "description": "Open welcome page"
    }
  ]
}
```

> 对于 built-in 插件，前端会根据 `pluginId` 推导出视图模块路径（例如 `src/plugins/welcome/views/index.tsx`）。无需在 manifest 中写入 `component_path`。

## 4. 顶层字段

### 4.1 `id`（必填）

- 类型：`string`
- 作用：插件全局唯一标识
- 建议：使用命名空间前缀，如 `builtin.xxx` / `org.xxx`

### 4.2 `name`（必填）

- 类型：`string`
- 作用：插件显示名称

### 4.3 `version`（必填）

- 类型：`string`
- 作用：插件版本号
- 建议：语义化版本（`1.0.0`）

### 4.4 `description`（可选）

- 类型：`string`
- 作用：插件描述

### 4.5 `activationEvents`（可选）

- 类型：`string[]`
- 作用：声明插件激活时机
- 支持值：
  - `onStartup`
  - `onCommand:<commandId>` / `onCommand:*`
  - `onView:<viewId>` / `onView:*`

说明：

- 未配置或空数组时，视为可在启动时激活。

## 5. `views` 字段

`views` 用于声明插件提供的页面贡献。

每一项字段：

- `id`（必填，`string`）：视图 ID（建议 `<plugin>.<name>`）
- `title`（必填，`string`）：视图标题
- `props`（可选，`object`）：传入视图组件的初始参数

说明：

- built-in 插件默认从 `src/plugins/<id>/views/index.tsx` 加载视图组件；不需要手动写 `component_path`。
- 如果在 manifest 中提供 `viewUrl`（见下一节），则可以由外部打包视图替代默认路径。

## 6. `commands` 字段

`commands` 用于声明命令元数据。

每一项字段：

- `id`（必填，`string`）：命令 ID（建议 `<plugin>.<action>`）
- `description`（必填，`string`）：命令描述

注意：

- 命令是否可执行，取决于插件 `index.ts` 中是否实现了对应 handler。

## 7. 外部插件资源字段

用于描述通过 `public/plugins/<pluginId>/` 放置的外部插件包：

- `moduleUrl`（可选，`string`）：指向打包好的 `index.js`，该文件会被 Worker 动态导入。
- `viewUrl`（可选，`string`）：如果插件携带视图包（`view/index.js`），可以在 manifest 中指出该 URL，前端会在 iframe 沙箱中直接加载。

> 异步加载：开发展现可用 React/Vue 等框架，借助打包器将插件打包到 `public/plugins/<pluginId>/`，再把路径写入 `public/plugins/manifest.json`。示例目录结构：
>
> ```text
> public/plugins/
>   └── demo-plugin/
>         ├── plugin.json
>         ├── index.js
>         └── view/index.js
> ```
>
> `public/plugins/manifest.json` 内容是插件项数组，插件入口 `PluginAssetCatalogService` 会在启动时读取并注册。

## 8. 约束与建议

1. 全局唯一性
- 插件 ID、视图 ID、命令 ID 必须保持全局唯一。

2. 路径一致性
- built-in 插件请保持 `src/plugins/<folder>` 结构与 `<pluginId>` 对应；外部插件请保证 manifest 中的 `moduleUrl/viewUrl` 可被 host 页面访问。

3. 元数据与代码一致
- `commands` 中声明的每个命令，应在插件模块中实现。

4. 启动一致性校验
- `plugin.json.id` 必须与 `index.ts` 默认导出的 `pluginId` 完全一致。

## 9. 推荐模板

```json
{
  "id": "builtin.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "My built-in plugin",
  "activationEvents": ["onStartup"],
  "views": [
    {
      "id": "myPlugin.main",
      "title": "My Plugin",
      "props": {}
    }
  ],
  "commands": [
    {
      "id": "myPlugin.open",
      "description": "Open my plugin view"
    }
  ]
}
```
