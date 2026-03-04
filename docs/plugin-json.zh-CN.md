# plugin.json 配置文档（中文）

本文档说明 `src/plugins/<plugin-folder>/plugin.json` 的配置格式与运行时语义。

## 1. 文件作用

`plugin.json` 是插件清单（Manifest），用于声明：

- 插件基础信息（`id`、`name`、`version`）
- 激活策略（`activationEvents`）
- 视图贡献（`views`）
- 命令贡献（`commands`）

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
  "views": [
    {
      "id": "welcome.main",
      "title": "Welcome",
      "component_path": "builtin.welcome/views/WelcomeView",
      "props": {}
    }
  ],
  "commands": [
    {
      "id": "welcome.open",
      "description": "Open welcome page"
    }
  ]
}
```

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
  - `onCommand:<commandId>`
  - `onCommand:*`
  - `onView:<viewId>`
  - `onView:*`

说明：

- 未配置或空数组时，视为可在启动时激活。

## 5. `views` 字段

`views` 用于声明插件提供的页面贡献。

每一项字段：

- `id`（必填，`string`）：视图 ID（建议 `<plugin>.<name>`）
- `title`（必填，`string`）：视图标题
- `component_path`（必填，`string`）：组件路径标识（例如 `builtin.welcome/views/WelcomeView`）
- `props`（可选，`object`）：传入视图组件的初始参数

## 6. `commands` 字段

`commands` 用于声明命令元数据。

每一项字段：

- `id`（必填，`string`）：命令 ID（建议 `<plugin>.<action>`）
- `description`（必填，`string`）：命令描述

注意：

- 命令是否可执行，取决于插件 `index.ts` 中是否实现了对应 handler。
- 当前实现不再使用旧版 `expose` 字段。

## 7. 约束与建议

1. 全局唯一性
- 插件 ID、视图 ID、命令 ID 应保持全局唯一。

2. 路径一致性
- `component_path` 必须与实际视图文件路径可解析结果一致。

3. 元数据与代码一致
- `commands` 中声明的每个命令，应在插件模块中实现。

## 8. 推荐模板

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
      "component_path": "builtin.my-plugin/views/MyPluginView",
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
