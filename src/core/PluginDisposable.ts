type Disposable = () => void | Promise<void>;

export class PluginDisposable {
    private disposables = new Map<string, Set<Disposable>>();

    /**
     * 注册一个可释放资源，支持同步/异步两种释放函数。
     * 返回值为“取消注册”函数，可用于提前移除。
     */
    add(pluginId: string, disposable: Disposable): () => void {
        let list = this.disposables.get(pluginId);
        if (!list) {
            list = new Set();
            this.disposables.set(pluginId, list);
        }
        list.add(disposable);

        return () => {
            const current = this.disposables.get(pluginId);
            current?.delete(disposable);
            if (current && current.size === 0) {
                this.disposables.delete(pluginId);
            }
        };
    }

    /**
     * 释放指定作用域的全部资源。
     * - 顺序执行，避免同一作用域内清理竞争。
     * - 异常仅记录，不中断后续资源释放。
     */
    async dispose(pluginId: string): Promise<void> {
        const list = this.disposables.get(pluginId);
        if (!list) return;
        this.disposables.delete(pluginId);

        for (const disposable of list) {
            try {
                await disposable();
            } catch (error) {
                console.error(`[PluginDisposable] Error disposing resource for ${pluginId}:`, error);
            }
        }
    }
}
