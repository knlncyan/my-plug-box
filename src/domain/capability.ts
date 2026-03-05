/**
 * 能力系统通用类型：
 * - `CapabilityContract` 表示一组可调用的宿主能力对象。
 * - `PluginCapabilityMap` 允许业务侧通过声明合并补充强类型能力映射。
 */
export type CapabilityMethod = (...args: unknown[]) => unknown | Promise<unknown>;

// 这里使用 unknown 成员而不是函数索引签名，避免强制每个能力接口声明 [key: string]。
export type CapabilityContract = Record<string, unknown>;

/**
 * 可被外部声明合并的能力类型映射：
 * - 示例：interface PluginCapabilityMap { files: FilesCapability }
 */
export interface PluginCapabilityMap { }

export type CapabilityById<K extends string> =
    K extends keyof PluginCapabilityMap
    ? PluginCapabilityMap[K]
    : CapabilityContract;

export interface CapabilityContext {
    pluginId: string;
}

export type CapabilityFactory<T = CapabilityContract> =
    (context: CapabilityContext) => T;
