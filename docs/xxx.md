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

## 3. 插件中使用（推荐）

```ts
const files = api.get('files');
await files.openFolder('E:/knln/Desktop');
```

## 4. 可选：通用调用方式

```ts
await api.call('files.openFolder', 'E:/knln/Desktop');
```

说明：优先使用 `api.get`，可读性和类型提示更好。

## 5. 命令触发时的数据流（简版）

`WorkbenchLayout` 点击命令按钮后，链路如下：

1. `useCoreRuntime.executeCommand(commandId)`
2. `PluginRuntimeService.executeCommand(...)`
3. `PluginCommandService.executeCommand(...)`
4. `WorkerSandboxService.executeCommand(...)`
5. `core/sandbox/worker.ts` 执行插件 `commands[commandId]`
6. 如插件内部再调用 `api.get/api.call`，通过 `worker-request` 回主线程分发
7. 返回结果后 runtime patch snapshot，UI 重渲染
