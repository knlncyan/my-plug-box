import { PluginEvents } from "../domain/event";

type EventHandler<T> = (payload: T) => void | Promise<void>;

export class PluginEventBus {
    private listeners = new Map<keyof PluginEvents, Set<EventHandler<any>>>();

    /**
     * 订阅事件
     * @returns dispose 函数，用于取消订阅
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
        handlers.add(handler);

        return () => {
            handlers?.delete(handler);
            if (handlers && handlers.size === 0) {
                this.listeners.delete(eventType);
            }
        };
    }

    /**
     * 发布事件（同步分发）
     */
    emit<K extends keyof PluginEvents>(eventType: K, payload: PluginEvents[K]): void {
        const handlers = this.listeners.get(eventType);
        if (!handlers) return;

        for (const handler of handlers) {
            try {
                const result = handler(payload);
                // 可选：支持异步 handler（但 emit 本身仍是 fire-and-forget）
                if (result instanceof Promise) {
                    result.catch(err => {
                        console.error(`[EventBus] Async handler error for "${eventType}":`, err);
                    });
                }
            } catch (error) {
                console.error(`[EventBus] Sync handler error for "${eventType}":`, error);
            }
        }
    }

    /**
     * 获取当前监听者数量（用于调试）
     */
    getListenerCount(eventType: keyof PluginEvents): number {
        return this.listeners.get(eventType)?.size ?? 0;
    }

    /**
     * 清空所有监听器（用于测试或重置）
     */
    clear(): void {
        this.listeners.clear();
    }
}
