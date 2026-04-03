export type CapabilityContract = Record<string, unknown>;


export interface PluginCapabilityMap { }

export type CapabilityById<K extends string> = K extends keyof PluginCapabilityMap ? PluginCapabilityMap[K] : CapabilityContract;

export interface CapabilityContext {
    pluginId: string;
}

export type CapabilityFactory<T = CapabilityContract> = (context: CapabilityContext) => T;
