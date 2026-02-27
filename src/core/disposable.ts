import type { Disposable } from './types';

/**
 * Collects Disposables and disposes them all at once.
 * Implements the same Disposable interface so it can itself be disposed.
 */
export class DisposableStore implements Disposable {
  private readonly _disposables: Disposable[] = [];
  private _disposed = false;

  /** Add a disposable to this store. Returns the added disposable for chaining. */
  add<T extends Disposable>(disposable: T): T {
    if (this._disposed) {
      // Already disposed — immediately clean up anything added late
      disposable.dispose();
    } else {
      this._disposables.push(disposable);
    }
    return disposable;
  }

  /** Dispose all tracked disposables and mark this store as disposed. */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const d of this._disposables) {
      try {
        d.dispose();
      } catch (e) {
        console.error('[DisposableStore] Error while disposing:', e);
      }
    }
    this._disposables.length = 0;
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  /** Convenience: wrap a plain function as a Disposable. */
  static from(fn: () => void): Disposable {
    return { dispose: fn };
  }
}
