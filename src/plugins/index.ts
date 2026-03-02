/**
 * Public built-in plugin entry used by runtime initialization and view rendering.
 */
import { pluginRuntime } from '../core/plugin-runtime';
import type { ComponentType } from 'react';
import type { BuiltinPluginManifest, BuiltinPluginModule } from '../core/plugin-protocol';

// 读文件建立索引
const manifestModules = import.meta.glob('./*/plugin.json', {
  eager: true,
  import: 'default',
});

const pluginModules = import.meta.glob('./*/index.ts', {
  eager: true,
  import: 'default',
});

const viewModules = import.meta.glob('./**/views/*View.tsx', {
  eager: true,
});

// 判断符不符合 插件Manifest 定义标准
function isManifest(value: unknown): value is BuiltinPluginManifest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.version === 'string'
  );
}

// 获取所有 PluginManifest
export function getBuiltinPluginManifests(): BuiltinPluginManifest[] {
  return Object.values(manifestModules)
    .filter(isManifest)
    .sort((a, b) => a.id.localeCompare(b.id));
}

// 根据 pluginId 拿到其对应的 index.ts
export function getBuiltinPluginModule(pluginId: string): BuiltinPluginModule | null {
  const folder = pluginId.replace(/^builtin\./, '');
  const moduleKey = `./${folder}/index.ts`;
  return (pluginModules[moduleKey] as BuiltinPluginModule | undefined) ?? null;
}

// 根据 视图的路径 读取其对应的 视图文件
export function resolveBuiltinViewComponent(componentPath: string): ComponentType<Record<string, unknown>> | null {
  const normalized = componentPath
    .replace(/\\/g, '/')
    .replace(/^builtin\./, '');
  const moduleKey = `./${normalized}.tsx`;
  const module = viewModules[moduleKey] as { default?: ComponentType<Record<string, unknown>> } | undefined;
  return module?.default ?? null;
}

// 加载所有预编译的内置插件
export async function loadBuiltInPlugins(): Promise<void> {
  await pluginRuntime.initialize();
}
