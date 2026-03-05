import type {
    CapabilityById,
    CapabilityContext,
    CapabilityContract,
    CapabilityFactory,
} from '../domain/capability';

/**
 * 宿主能力注册中心：
 * 1) 对外暴露 `register`，支持在任意模块注册能力。
 * 2) 按插件作用域缓存能力实例，避免重复创建。
 * 3) 提供统一 `invoke` 调度，供 Worker 通道复用。
 */
export class CapabilityRegistry {
    private readonly factories = new Map<string, CapabilityFactory<CapabilityContract>>();
    private readonly capabilityCache = new Map<string, unknown>();

    register<K extends string>(capabilityId: K, factory: CapabilityFactory<CapabilityById<K>>): () => void {
        if (this.factories.has(capabilityId)) {
            throw new Error(`Duplicated capability id: ${capabilityId}`);
        }

        this.factories.set(
            capabilityId,
            factory as unknown as CapabilityFactory<CapabilityContract>
        );

        return () => {
            this.factories.delete(capabilityId);
            this.evictCapabilityCache(capabilityId);
        };
    }

    resolve<K extends string>(pluginId: string, capabilityId: K): CapabilityById<K> {
        const cacheKey = this.buildCacheKey(pluginId, capabilityId);
        const cached = this.capabilityCache.get(cacheKey);
        if (cached) {
            return cached as CapabilityById<K>;
        }

        const factory = this.factories.get(capabilityId);
        if (!factory) {
            throw new Error(`Capability not found: ${capabilityId}`);
        }

        const context: CapabilityContext = { pluginId };
        const created = factory(context);
        this.capabilityCache.set(cacheKey, created);
        return created as CapabilityById<K>;
    }

    async invoke(
        pluginId: string,
        capabilityId: string,
        method: string,
        args: unknown[]
    ): Promise<unknown> {
        const capability = this.resolve(pluginId, capabilityId) as CapabilityContract;
        const member = capability[method];
        if (typeof member !== 'function') {
            throw new Error(`Capability method not found: ${capabilityId}.${method}`);
        }
        return (member as (...invokeArgs: unknown[]) => unknown | Promise<unknown>)(...args);
    }

    private buildCacheKey(pluginId: string, capabilityId: string): string {
        return `${pluginId}::${capabilityId}`;
    }

    private evictCapabilityCache(capabilityId: string): void {
        const suffix = `::${capabilityId}`;
        for (const key of Array.from(this.capabilityCache.keys())) {
            if (key.endsWith(suffix)) {
                this.capabilityCache.delete(key);
            }
        }
    }
}
