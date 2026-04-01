# ModuDesk 插件开发工具（plugin-devtool）

这个工具用于创建和构建外部插件项目。

## 设计说明

- `init` 不会读取宿主项目 `src/**`。
- SDK 类型来源于开发工具内的类型快照文件：`bin/modudesk-sdk-types.json`。
- 宿主能力类型变化后，由你手动执行脚本更新这个快照。

## 手动更新 SDK 类型快照

在主仓库执行：

```bash
node tools/plugin-devtool/scripts/update-sdk-types.mjs
```

类型来源由清单文件配置：

- `tools/plugin-devtool/scripts/sdk-type-sources.json`

你可以在这里增删来源文件或添加替换规则（例如修正 import 路径）。

执行后会生成/覆盖：

- `tools/plugin-devtool/bin/modudesk-sdk-types.json`

这个文件可随开发工具一起分发给开发者。

## 一键打包可执行工具（Windows / Linux / macOS）

在仓库根目录执行：

```bash
pnpm --dir tools/plugin-devtool install
pnpm --dir tools/plugin-devtool run update:sdk-types
pnpm --dir tools/plugin-devtool run build:executables:all
```

打包产物目录：

- `tools/plugin-devtool/dist/`

可选：仅打包部分平台

```bash
pnpm --dir tools/plugin-devtool run build:executables -- --targets=windows
pnpm --dir tools/plugin-devtool run build:executables -- --targets=linux
pnpm --dir tools/plugin-devtool run build:executables -- --targets=macos
# 可选（在部分 Windows 环境可能失败）
pnpm --dir tools/plugin-devtool run build:executables -- --targets=macos-arm64
```

## 命令

```bash
# 初始化插件项目
node tools/plugin-devtool/bin/modudesk-plugin.mjs init my-plugin --framework react
# 或
node tools/plugin-devtool/bin/modudesk-plugin.mjs init my-plugin --framework vue
# 或（简写）
node tools/plugin-devtool/bin/modudesk-plugin.mjs init my-plugin --react
node tools/plugin-devtool/bin/modudesk-plugin.mjs init my-plugin --vue

# 构建插件
node tools/plugin-devtool/bin/modudesk-plugin.mjs build my-plugin

# 将当前开发工具内的类型快照同步到已有插件项目
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

```text
dist/<pluginId>/
  index.js
  plugin.json
  view/index.js
  icon.svg (可选)
  assets/**
```

将 `dist/<pluginId>` 拷贝到宿主插件目录即可。
