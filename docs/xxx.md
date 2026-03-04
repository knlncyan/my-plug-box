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
