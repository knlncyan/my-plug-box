type EventHandler<T> = (payload: T) => void | Promise<void>;
interface PluginEvents {
    "setting.changed": { pluginId: string; key: string; value: unknown };
    [event: string]: unknown;
}

export class PluginEventBus {
    private listeners = new Map<keyof PluginEvents, Set<EventHandler<unknown>>>();

    /**
     * 订阅事件。
     * 返回取消订阅函数。
     */
    on<K extends keyof PluginEvents>(
        eventType: K,
        handler: EventHandler<PluginEvents[K]>
    ): () => void {
        let handlers = this.listeners.get(eventType);
        if (!handlers) {
            handlers = new Set();
            this.listeners.set(eventType, handlers);
        }
        handlers.add(handler as EventHandler<unknown>);

        return () => {
            handlers?.delete(handler as EventHandler<unknown>);
            if (handlers && handlers.size === 0) {
                this.listeners.delete(eventType);
            }
        };
    }

    /**
     * 发布事件（同步分发）。
     */
    emit<K extends keyof PluginEvents>(eventType: K, payload: PluginEvents[K]): void {
        const handlers = this.listeners.get(eventType);
        if (!handlers) return;

        for (const handler of handlers) {
            try {
                const result = handler(payload);
                if (result instanceof Promise) {
                    result.catch((error) => {
                        console.error(`[EventBus] Async handler error for "${String(eventType)}":`, error);
                    });
                }
            } catch (error) {
                console.error(`[EventBus] Sync handler error for "${String(eventType)}":`, error);
            }
        }
    }
}