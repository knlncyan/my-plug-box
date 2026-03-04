type Disposable = () => void;

export class PluginDisposable {
    private disposables = new Map<string, Set<Disposable>>();

    add(pluginId: string, disposable: Disposable) {
        let list = this.disposables.get(pluginId);
        if (!list) {
            list = new Set();
            this.disposables.set(pluginId, list);
        }
        list.add(disposable);
    }

    dispose(pluginId: string) {
        const list = this.disposables.get(pluginId);
        if (!list) return;

        for (const disposable of list) {
            try {
                disposable();
            } catch (error) {
                console.error(`[PluginDisposable] Error disposing resource for ${pluginId}:`, error);
            }
        }

        this.disposables.delete(pluginId);
    }

    // 可选：提供查询接口（用于调试）
    has(pluginId: string): boolean {
        return this.disposables.has(pluginId);
    }
}