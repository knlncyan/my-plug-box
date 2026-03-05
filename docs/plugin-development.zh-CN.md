# 插件开发手册（中文）

本文档面向本项目插件开发者，覆盖从创建插件到扩展宿主能力的基本流程。

## 1. 快速认知

当前插件系统由三部分构成：

1. `plugin.json`：声明插件元数据（视图、命令、激活策略）。
2. `index.ts`：插件运行时模块（命令处理、activate/deactivate）。
3. `views/*View.tsx`：插件视图组件。

运行时特性：

- 命令在独立 Worker 中执行（插件间隔离）。
- 视图在独立 iframe 中渲染（避免污染宿主 DOM）。
- 插件通过 `PluginHostAPI` 调用宿主能力。

## 2. 目录约定

```text
src/plugins/<your-plugin>/
  plugin.json
  index.ts
  views/
    <YourView>.tsx
```

插件 ID 与目录建议一致，例如：

- 目录：`src/plugins/my-plugin`
- `plugin.json.id`：`builtin.my-plugin`

## 3. 编写 plugin.json

示例：

```json
{
  "id": "builtin.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "My built-in plugin",
  "activationEvents": ["onStartup", "onCommand:myPlugin.open"],
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

激活事件支持：

- `onStartup`
- `onCommand:<commandId>` / `onCommand:*`
- `onView:<viewId>` / `onView:*`

## 4. 编写插件入口 index.ts

示例：

```ts
import type { BuiltinPluginModule } from '../../domain/protocol/plugin-runtime.protocol';

const plugin: BuiltinPluginModule = {
  pluginId: 'builtin.my-plugin',
  activate: async (api) => {
    const storage = api.get('storage');
    const launch = ((await storage.get<number>('launch_count')) ?? 0) + 1;
    await storage.set('launch_count', launch);
  },
  deactivate: () => {
    console.info('[my-plugin] deactivated');
  },
  commands: {
    'myPlugin.open': (context) => {
      const views = context.api.get('views');
      views.activate('myPlugin.main');
    },
  },
};

export default plugin;
```

## 5. PluginHostAPI 说明

在 `activate/deactivate/command handler` 中可使用：

- `api.get('commands')`：命令能力（执行命令）
- `api.get('views')`：视图能力（切换视图）
- `api.get('events')`：事件能力（发布/订阅）
- `api.get('settings')`：设置能力（按 `pluginId.key` 命名空间）
- `api.get('storage')`：插件私有存储能力
- `api.call(method, params)`：通用 RPC 风格调用

## 6. 命令上下文 CommandExecutionContext

命令 handler 第一个参数是 `context`，当前只保留：

- `context.api`（`PluginHostAPI`）

说明：

- 命令链防循环在运行时内核处理（如 `A -> B -> A` 会抛错）。
- 命令内要调用其他命令，请使用 `context.api.get('commands').execute(...)`。

## 7. 插件视图开发

`views/*.tsx` 是普通 React 组件，但运行在 iframe 沙箱。

建议：

- 不依赖宿主全局 DOM。
- 通过运行时 API 完成插件协作，不直接耦合宿主内部实现。

## 8. 扩展宿主能力（推荐方式）

### 8.1 注册能力

在任意模块调用 `registerCapability`：

```ts
import { registerCapability } from '../core';

export interface FilesCapability {
  openFolder(path: string): Promise<void>;
}

declare module '../domain/capability' {
  interface PluginCapabilityMap {
    files: FilesCapability;
  }
}

registerCapability('files', ({ pluginId }) => ({
  async openFolder(path: string) {
    console.info(`[files] plugin=${pluginId}, path=${path}`);
    // 在这里调用后端 service / Rust API
  },
}));
```

### 8.2 插件侧使用

```ts
const files = api.get('files');
await files.openFolder('E:/knln/Desktop');
```

## 9. 推荐开发流程

1. 新建插件目录与 `plugin.json`。
2. 实现 `index.ts` 与视图组件。
3. 在命令面板或侧栏触发命令联调。
4. 必要时新增能力并通过 `registerCapability` 注册。
5. 运行 `pnpm tsc --noEmit` 做类型验证。

## 10. 常见问题

1. 视图不显示
- 检查 `component_path` 与视图文件路径映射是否一致。

2. 命令存在但执行失败
- 检查 `plugin.json.commands[].id` 与 `index.ts commands` 是否同名。

3. 跨插件命令无效
- 检查目标命令是否已注册且插件满足激活条件。

4. 设置/存储未生效
- 检查是否使用了 `await`，并确认后端持久化命令成功。
