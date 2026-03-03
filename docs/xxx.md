下面给你一个“能力注册表模式”的最小案例（`files` 能力）：

```ts
// 1) 定义能力接口
type FilesCapability = {
  openFolder(path: string): Promise<void>;
};

// 2) 能力注册项
type CapabilityFactory<T> = (pluginId: string) => T;
const capabilityRegistry = new Map<string, CapabilityFactory<unknown>>();

export function registerCapability<T>(id: string, factory: CapabilityFactory<T>) {
  capabilityRegistry.set(id, factory as CapabilityFactory<unknown>);
}
```

```ts
// 3) 宿主启动时注册能力（内部仍可调用 pluginBackend.service）
registerCapability<FilesCapability>('files', (_pluginId) => ({
  async openFolder(path: string) {
    // 这里调用 Rust API，比如 service.openFolder(path)
    console.log('open folder:', path);
  },
}));
```

```ts
// 4) 按插件权限注入能力
function createPluginApi(pluginId: string, permissions: string[]) {
  return {
    capabilities: {
      get<T>(id: string): T {
        if (!permissions.includes(id)) {
          throw new Error(`Plugin ${pluginId} has no permission: ${id}`);
        }
        const factory = capabilityRegistry.get(id);
        if (!factory) throw new Error(`Capability not found: ${id}`);
        return factory(pluginId) as T;
      },
    },
  };
}
```

```ts
// 5) 插件中使用
const api = createPluginApi('builtin.command-palette', ['files']);
const files = api.capabilities.get<FilesCapability>('files');
await files.openFolder('E:/knln/Desktop');
```

这个模式的重点是：  
`PluginHostAPI` 不需要无限加方法，新能力只需“注册 + 授权 + 注入”。