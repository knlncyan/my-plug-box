# ModuDesk 插件开发工具（plugin-devtool）

该工具用于快速创建和构建外部插件。初始化时会自动从宿主 `src/domain` 同步 SDK 类型；后续宿主类型有变化时可手动执行 `sync-sdk` 刷新。

## 功能

- `init`：创建 React/Vue 插件工程模板。
- `build`：打包为 `dist/<pluginId>/**` 结构。
- `sync-sdk`：手动从宿主源码同步最新 SDK 类型到项目 `sdk/types`。

## 命令

```bash
# 初始化插件项目
node tools/plugin-devtool/bin/modudesk-plugin.mjs init my-plugin --framework react
# 或
node tools/plugin-devtool/bin/modudesk-plugin.mjs init my-plugin --framework vue

# 构建插件
node tools/plugin-devtool/bin/modudesk-plugin.mjs build my-plugin

# 手动刷新 SDK 类型
node tools/plugin-devtool/bin/modudesk-plugin.mjs sync-sdk my-plugin
```

## 项目结构

```text
my-plugin/
  modudesk.config.json
  package.json
  tsconfig.json
  scripts/build.mjs
  sdk/
    index.ts
    react.ts
    react-jsx-runtime.ts
    types/
      capability.ts
      api.ts
      plugin-module.ts
  src/
    index.ts
    icon.svg
    view/
      index.tsx | index.vue
      style.css
```

## 构建产物

构建后输出到：

```text
dist/<pluginId>/
  index.js
  plugin.json
  view/index.js
  icon.svg (可选)
  assets/**
```

将 `dist/<pluginId>` 拷贝到宿主插件目录（如 `public/plugins/<pluginId>` 或后端扫描目录）即可。

## 类型同步机制

`sync-sdk` 会从宿主工程读取并同步以下类型源：

- `src/domain/capability.ts`
- `src/domain/api.ts`
- `src/domain/protocol/plugin-module.protocol.ts`

这意味着你在宿主里调整 `PluginCapabilityMap` 或 `PluginHostAPI` 后，可以一键同步到插件侧类型提示。

## 能力扩展示例

插件侧可继续做模块增强：

```ts
import type { CapabilityContract } from '@modudesk/plugin-sdk';

declare module '@modudesk/plugin-sdk' {
  interface PluginCapabilityMap {
    files: CapabilityContract;
  }
}
```

如果是宿主新增能力，推荐先更新宿主类型，再执行 `sync-sdk`。
