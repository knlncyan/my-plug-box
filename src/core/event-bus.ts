import type { Disposable } from './types';
import { DisposableStore } from './disposable';

type Handler = (data: unknown) => void;

/** Lightweight pub/sub event bus. */
export class EventBus {
  private readonly _listeners = new Map<string, Set<Handler>>();

  /**
   * Subscribe to an event.
   * @returns A Disposable that unsubscribes when disposed.
   */
  on(event: string, handler: Handler): Disposable {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(handler);
    return DisposableStore.from(() => {
      this._listeners.get(event)?.delete(handler);
    });
  }

  /** Publish an event to all subscribers. Errors in handlers are caught and logged. */
  emit(event: string, data?: unknown): void {
    const handlers = this._listeners.get(event);
    if (!handlers) return;
    for (const h of handlers) {
      try {
        h(data);
      } catch (e) {
        console.error(`[EventBus] Handler error for event "${event}":`, e);
      }
    }
  }
}

/** Application-wide singleton event bus. */
export const globalEventBus = new EventBus();
