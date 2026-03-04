/**
 * 能力系统通用类型：
 * - `CapabilityContract` 表示一组可调用的方法集合。
 * - `PluginCapabilityMap` 允许业务侧通过声明合并补充强类型能力映射。
 */
export type CapabilityMethod = (...args: unknown[]) => unknown | Promise<unknown>;

export type CapabilityContract = Record<string, CapabilityMethod>;

/**
 * 可被外部声明合并的能力类型映射：
 * - 示例：`interface PluginCapabilityMap { files: FilesCapability }`
 */
export interface PluginCapabilityMap { }

export type CapabilityById<K extends string> =
    K extends keyof PluginCapabilityMap
    ? PluginCapabilityMap[K]
    : CapabilityContract;

export interface CapabilityContext {
    pluginId: string;
}

export type CapabilityFactory<T extends CapabilityContract = CapabilityContract> =
    (context: CapabilityContext) => T;
