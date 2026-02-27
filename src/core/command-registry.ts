import type { Disposable, RegisteredCommand } from './types';
import { DisposableStore } from './disposable';

export class CommandRegistry {
  private readonly _commands = new Map<string, RegisteredCommand>();
  private readonly _changeListeners = new Set<() => void>();

  /**
   * Register a command handler.
   * If the command ID already exists it will be overwritten (with a warning).
   * Returns a Disposable that removes the registration.
   */
  register(
    id: string,
    handler: (...args: unknown[]) => unknown,
    meta: Omit<RegisteredCommand, 'id' | 'handler'>
  ): Disposable {
    if (this._commands.has(id)) {
      console.warn(`[CommandRegistry] Command "${id}" already registered — overwriting.`);
    }
    this._commands.set(id, { id, handler, ...meta });
    this._notifyChange();
    return DisposableStore.from(() => {
      if (this._commands.get(id)?.handler === handler) {
        this._commands.delete(id);
        this._notifyChange();
      }
    });
  }

  /** Execute a registered command. Rejects if the command is not found. */
  execute(id: string, ...args: unknown[]): Promise<unknown> {
    const cmd = this._commands.get(id);
    if (!cmd) {
      return Promise.reject(new Error(`Command not found: "${id}"`));
    }
    try {
      return Promise.resolve(cmd.handler(...args));
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /** Return all registered commands (used by the command palette). */
  getAll(): RegisteredCommand[] {
    return Array.from(this._commands.values());
  }

  /** Subscribe to registry changes (commands added/removed). */
  onChange(handler: () => void): Disposable {
    this._changeListeners.add(handler);
    return DisposableStore.from(() => this._changeListeners.delete(handler));
  }

  private _notifyChange(): void {
    for (const h of this._changeListeners) h();
  }
}
