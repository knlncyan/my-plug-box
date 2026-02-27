import type React from 'react';
import type { Disposable, RegisteredView } from './types';
import { DisposableStore } from './disposable';

export class ViewRegistry {
  private readonly _views = new Map<string, RegisteredView>();
  private readonly _changeListeners = new Set<() => void>();

  /** Register a view entry directly. Returns a Disposable to unregister. */
  register(view: RegisteredView): Disposable {
    this._views.set(view.id, view);
    this._notifyChange();
    return DisposableStore.from(() => {
      if (this._views.get(view.id) === view) {
        this._views.delete(view.id);
        this._notifyChange();
      }
    });
  }

  /** Convenience: register a React component as a view. */
  registerComponent(
    id: string,
    component: React.ComponentType,
    meta: Omit<RegisteredView, 'id' | 'component' | 'iframeUrl'>
  ): Disposable {
    return this.register({ id, component, ...meta });
  }

  /** Convenience: register an iframe URL as a view (for external plugins). */
  registerIframe(
    id: string,
    iframeUrl: string,
    meta: Omit<RegisteredView, 'id' | 'component' | 'iframeUrl'>
  ): Disposable {
    return this.register({ id, iframeUrl, ...meta });
  }

  getById(id: string): RegisteredView | undefined {
    return this._views.get(id);
  }

  getByLocation(location: RegisteredView['location']): RegisteredView[] {
    return Array.from(this._views.values()).filter(v => v.location === location);
  }

  onChange(handler: () => void): Disposable {
    this._changeListeners.add(handler);
    return DisposableStore.from(() => this._changeListeners.delete(handler));
  }

  private _notifyChange(): void {
    for (const h of this._changeListeners) h();
  }
}
