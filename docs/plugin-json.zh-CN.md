# plugin.json 配置文档（中文）

本文档用于说明 `src/plugins/<plugin-folder>/plugin.json` 的配置格式与语义。

## 1. 文件作用

`plugin.json` 是插件清单（Manifest），用于声明插件的静态元信息和贡献点，包括：

- 插件基础信息（`id`、`name`、`version`）
- 激活策略（`activationEvents`）
- 视图贡献（`views`）
- 命令贡献（`commands`）

前端运行时会读取该文件并将信息注册到 Rust 插件管理器。

## 2. 最小可用示例

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
      "description": "Open welcome page",
      "expose": false
    }
  ]
}
```

## 4. 顶层字段说明

### 4.1 `id`（必填）

- 类型：`string`
- 作用：插件唯一标识，全局唯一
- 建议：使用命名空间前缀，例如 `builtin.xxx` / `your-company.xxx`

### 4.2 `name`（必填）

- 类型：`string`
- 作用：插件显示名称

### 4.3 `version`（必填）

- 类型：`string`
- 作用：插件版本号
- 建议：语义化版本（例如 `1.0.0`）

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

- 未配置或空数组时，当前实现等价于可在启动时激活。

## 5. `views` 字段说明

`views` 用于声明插件提供的页面。

每一项字段：

- `id`（必填，`string`）：视图唯一 ID，建议使用 `<plugin>.<name>` 风格。
- `title`（必填，`string`）：视图标题。
- `component_path`（必填，`string`）：组件路径标识，例如 `builtin.welcome/views/WelcomeView`。
- `props`（可选，`object`）：传给视图组件的初始参数。

## 6. `commands` 字段说明

`commands` 用于声明插件命令元数据。

每一项字段：

- `id`（必填，`string`）：命令唯一 ID。
- `description`（必填，`string`）：命令描述。
- `expose`（可选，`boolean`，默认 `false`）：命令是否对其他插件公开。

## 7. `expose` 语义（重要）

`expose` 只控制“跨插件调用”能力，不是“命令是否存在”。

- `expose: true`
  - 其他插件可以调用该命令。
- `expose: false`（或不写）
  - 其他插件不能调用。
  - 插件自身调用自己的命令仍然允许。

补充：

- 当前实现中，宿主 UI 触发命令不受 `expose` 的跨插件限制（因为不是插件间调用）。
- 命令面板等公共入口通常应只展示 `expose: true` 的命令。

## 8. 常见错误与建议

### 8.1 ID 冲突

- 现象：不同插件使用同名 `id`（命令或视图）导致冲突。
- 建议：统一使用插件名前缀（如 `welcome.open`、`welcome.main`）。

### 8.2 `component_path` 无法解析

- 现象：视图无法渲染，提示组件找不到。
- 建议：检查路径与文件名是否一致，大小写是否匹配。

### 8.3 配置了命令但没有实现 handler

- 现象：命令存在但执行报错“handler 未实现”。
- 建议：在对应插件 `index.ts` 的 `commands` 中实现同 ID 处理函数。

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
      "component_path": "builtin.my-plugin/views/MyPluginView",
      "props": {}
    }
  ],
  "commands": [
    {
      "id": "myPlugin.open",
      "description": "Open my plugin view",
      "expose": true
    }
  ]
}
```
