# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 目录结构

src/
├── core/                        # 插件系统核心
│   ├── types.ts                 # 所有核心接口定义
│   ├── disposable.ts            # Disposable 资源清理模式
│   ├── event-bus.ts             # 全局事件总线
│   ├── command-registry.ts      # 命令注册中心
│   ├── view-registry.ts         # 视图/面板注册中心
│   ├── menu-registry.ts         # 菜单贡献注册中心
│   ├── settings-registry.ts     # 设置注册中心
│   ├── plugin-api-factory.ts    # 为每个插件构建隔离的 API 实例
│   ├── plugin-bridge.ts         # iframe <-> host 消息桥
│   ├── plugin-manager.ts        # 插件生命周期管理
│   └── index.ts                 # 统一导出
│
├── shell/                       # 应用 Shell UI（完全由插件贡献驱动）
│   ├── AppShell.tsx             # 顶层布局
│   ├── MenuBar.tsx              # 菜单栏（MenuRegistry 驱动）
│   ├── Sidebar.tsx              # 侧边栏（ViewRegistry sidebar 驱动）
│   ├── MainArea.tsx             # 主内容区（ViewRegistry main 驱动）
│   ├── CommandPalette.tsx       # 命令面板 UI
│   └── PluginViewHost.tsx       # 渲染插件 View（iframe 或 React 组件）
│
├── sandbox/                     # 外部插件沙箱
│   ├── sandbox.html             # iframe 宿主页面
│   └── sandbox-api.ts           # 在 iframe 内注入的 API 代理
│
├── plugins/                     # 内置插件
│   ├── index.ts                 # 内置插件注册表（编译时）
│   ├── welcome/                 # 示例：欢迎页面插件
│   │   ├── plugin.json
│   │   ├── index.ts
│   │   └── WelcomeView.tsx
│   └── command-palette/         # 命令面板插件（注册 Ctrl+Shift+P 命令）
│       ├── plugin.json
│       └── index.ts
│
├── App.tsx                      # 入口：初始化插件系统后渲染 AppShell
└── main.tsx

## 关键特性
特性	         实现方式
内置插件	     TypeScript 模块，直接访问注册表 API
外部插件	     PluginBridge — iframe + MessageChannel 沙箱
资源清理	     DisposableStore — deactivate 时自动清理所有注册
命令面板	     Ctrl+Shift+P，支持按名称/分类筛选，键盘导航
视图标签页	     MainArea 管理主区域标签；view.focus 事件可编程切换
设置命名空间	 插件调用 settings.get('foo') → 实际存储为 pluginId.foo

## 各模块职责
### event-bus.ts
简单的 EventEmitter，支持 on/off/emit

返回 Disposable 便于取消订阅

全局单例

### command-registry.ts
register(id, handler) → Disposable

execute(id, ...args) → Promise

getAll() 供命令面板列举

校验：命令 ID 重复时 warn 而不 throw

### view-registry.ts
内置视图：存 React 组件引用

外部视图：存 iframe src URL

分 location bucket（sidebar / main / panel）

onChange 通知 Shell 重渲染

### menu-registry.ts
按 context 分组存储菜单项

getItems(context) 供 MenuBar 渲染

onChange 通知 Shell

### settings-registry.ts
在 localStorage 持久化

get/set/onChange

插件只能读写自己 namespace 下的 key（pluginId.key）

plugin-api-factory.ts

工厂函数：createPluginAPI(pluginId, registries)

为每个插件绑定 pluginId，订阅/注册都打 namespace

收集该插件的所有 Disposable，统一清理

plugin-bridge.ts（外部插件 iframe 通信）

消息格式（postMessage）：

// Plugin → Host
type PluginMessage =
  | { type: 'REGISTER_COMMAND'; id: string; callbackId: string }
  | { type: 'EXECUTE_COMMAND'; id: string; args: unknown[]; reqId: string }
  | { type: 'EMIT_EVENT'; event: string; data: unknown }
  | { type: 'GET_SETTING'; key: string; reqId: string }
  | { type: 'SET_SETTING'; key: string; value: unknown }
  | { type: 'REGISTER_VIEW'; id: string };

// Host → Plugin
type HostMessage =
  | { type: 'CALL_HANDLER'; callbackId: string; args: unknown[] }
  | { type: 'COMMAND_RESULT'; reqId: string; result: unknown }
  | { type: 'SETTING_VALUE'; reqId: string; value: unknown }
  | { type: 'EVENT'; event: string; data: unknown };
PluginBridge 职责：

创建 iframe，设置 sandbox 属性（allow-scripts allow-same-origin）
建立 MessageChannel，传入 iframe
将收到的消息翻译为对 Registry 的调用

### plugin-manager.ts
registerBuiltin(manifest, pluginModule) — 注册内置插件
loadExternal(manifestPath) — 从磁盘读取外部插件（Tauri fs API）
activate(pluginId) — 调用 plugin.activate(api)
deactivate(pluginId) — 清理所有 Disposable，销毁 iframe
getAll() — 返回已知插件列表（用于插件管理 UI）

## 学习路径
graph TD
    A[App.tsx 入口] --> B[plugin-manager.ts]
    B --> C[plugin-api-factory.ts]
    C --> D[command-registry.ts]
    C --> E[view-registry.ts]
    C --> F[menu-registry.ts]
    D --> G[event-bus.ts]
    E --> H[PluginViewHost.tsx]
    F --> I[MenuBar.tsx]
    G --> J[插件间通信实验]
    H --> K[UI 渲染流程]
    I --> L[菜单生成逻辑]
    B --> M[sandbox/plugin-bridge.ts]
    M --> N[iframe 沙箱通信]
