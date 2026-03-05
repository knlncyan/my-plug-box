# 能力注册表最小示例（files）

本文演示如何在当前项目中注册并使用一个 `files` 能力。

## 1. 定义能力接口 + 类型映射

```ts
// src/capabilities/files.ts
export interface FilesCapability {
  openFolder(path: string): Promise<void>;
}

declare module '../domain/capability' {
  interface PluginCapabilityMap {
    files: FilesCapability;
  }
}
```

## 2. 注册能力

```ts
import { registerCapability } from '../core';

export const disposeFiles = registerCapability('files', ({ pluginId }) => ({
  async openFolder(path: string) {
    console.info(`[files] plugin=${pluginId}, path=${path}`);
    // 调用 Rust API 或前端 service
  },
}));
```

## 3. 插件中使用

```ts
const files = api.capabilities.get('files');
await files.openFolder('E:/knln/Desktop');
```

## 4. 可选：通用调用方式

```ts
await api.capabilities.call('capability.invoke', {
  capabilityId: 'files',
  method: 'openFolder',
  args: ['E:/knln/Desktop'],
});
```

推荐优先使用 `capabilities.get`，可读性和类型提示更好。

## 5. 调用时数据流通方向

你现在“左侧点击命令”的主数据流是这条：

1. UI 点击触发  
在 [WorkbenchLayout.tsx](/e:/knln/Desktop/practice/plug-box/src/ui/layout/WorkbenchLayout.tsx) 里，按钮 `onClick` 调用 `runCommand(command.id)`，再调用 `executeCommand(commandId)`。

2. Hook 转发到 runtime  
`executeCommand` 来自 [useCoreRuntime.ts](/e:/knln/Desktop/practice/plug-box/src/core/useCoreRuntime.ts)，在主窗口环境会直接调用 `coreRuntime.executeCommand(...)`。

3. runtime 进入命令编排  
在 [PluginRuntimeService.ts](/e:/knln/Desktop/practice/plug-box/src/core/service/PluginRuntimeService.ts) 里：
- `executeCommand` -> `executeCommandInternal`
- 再转给 `PluginCommandService.executeCommand(...)`

4. 命令服务做校验与激活  
在 [PluginCommandService.ts](/e:/knln/Desktop/practice/plug-box/src/core/service/PluginCommandService.ts)：
- 根据 `commandId` 查命令归属插件
- 做循环调用检测（`trace`）
- 插件未激活则走 `PluginActivationService` 激活，再让 `WorkerSandboxService.activate(pluginId)`

5. 发送到插件 Worker 执行  
同文件把命令转发给 [WorkerSandboxService.ts](/e:/knln/Desktop/practice/plug-box/src/core/service/WorkerSandboxService.ts) 的 `executeCommand`。  
`WorkerSandboxService` 会 `postMessage` 给对应插件 worker（`host-request: execute-command`）。

6. Worker 内执行插件命令处理器  
在 [worker.ts](/e:/knln/Desktop/practice/plug-box/src/core/sandbox/worker.ts)：
- `handleHostRequest('execute-command')`
- `executeCommand(...)` 找到 `module.commands[commandId]` 并执行
- 插件代码本体在 [command-palette/index.ts](/e:/knln/Desktop/practice/plug-box/src/plugins/command-palette/index.ts) / [welcome/index.ts](/e:/knln/Desktop/practice/plug-box/src/plugins/welcome/index.ts)

7. 如果命令里再调宿主能力  
插件里 `api.get(...).xxx(...)` 或 `api.call(...)` 会继续从 worker 发 `worker-request` 回宿主，  
由 [WorkerSandboxService.ts](/e:/knln/Desktop/practice/plug-box/src/core/service/WorkerSandboxService.ts) 的 `dispatchWorkerRequest` 分发处理（如 `command.execute`、`settings.set`、`capability.invoke`）。

8. 返回结果并更新 UI  
结果回到 `PluginCommandService`。若返回值是某个 `viewId`，会触发 `setActiveView`。  
`PluginRuntimeService` patch snapshot 后，`useCoreRuntime` 订阅到变化，`WorkbenchLayout` 重渲染，视图区域由 [PluginRenderer.tsx](/e:/knln/Desktop/practice/plug-box/src/ui/plugin/PluginRenderer.tsx) 显示对应页面。

一句话：  
`左侧按钮 -> useCoreRuntime -> PluginRuntimeService -> PluginCommandService -> WorkerSandboxService -> worker.ts(插件命令) -> 回传 -> runtime 快照更新 -> UI 重渲染`。