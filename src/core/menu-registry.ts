import type { Disposable, RegisteredMenuItem } from './types';
import { DisposableStore } from './disposable';

export class MenuRegistry {
  private readonly _items = new Map<string, RegisteredMenuItem[]>();
  private readonly _changeListeners = new Set<() => void>();

  /** Add a menu item to a context (e.g. 'menubar'). Returns a Disposable to remove it. */
  addItem(item: RegisteredMenuItem): Disposable {
    let list = this._items.get(item.context);
    if (!list) {
      list = [];
      this._items.set(item.context, list);
    }
    list.push(item);
    this._notifyChange();
    return DisposableStore.from(() => {
      const l = this._items.get(item.context);
      if (l) {
        const idx = l.indexOf(item);
        if (idx !== -1) {
          l.splice(idx, 1);
          this._notifyChange();
        }
      }
    });
  }

  /** Get all menu items for a given context. */
  getItems(context: string): RegisteredMenuItem[] {
    return this._items.get(context) ?? [];
  }

  onChange(handler: () => void): Disposable {
    this._changeListeners.add(handler);
    return DisposableStore.from(() => this._changeListeners.delete(handler));
  }

  private _notifyChange(): void {
    for (const h of this._changeListeners) h();
  }
}
