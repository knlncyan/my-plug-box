import { useEffect, useSyncExternalStore } from 'react';
import { container } from './index';
import { PluginRuntimeService } from './service/PluginRuntimeService';
import { CommandShortcutService } from './service/CommandShortcutService';

export function useCoreRuntime() {
    const coreRuntime = container.resolve(PluginRuntimeService);
    const css = container.resolve(CommandShortcutService);

    const snapshot = useSyncExternalStore(coreRuntime.subscribe, coreRuntime.getSnapshot, coreRuntime.getSnapshot);

    useEffect(() => {
        void coreRuntime.initialize();
    }, []);

    return {
        ...snapshot,
        executeCommand: coreRuntime.executeCommand,
        setActiveView: coreRuntime.setActiveView,
        refresh: coreRuntime.refresh,
        shutdown: coreRuntime.shutdown,
        // 快捷键服务的方法
        refreshShortcuts: css.refresh,
        getCommandsWithShorcut: css.getCommandsWithShortcut,
        registerSystemCommandHander: css.registerSystemCommandHander,
        updateShortcutBinding: css.updateShortcutBinding,
        resetShortcutBinding: css.resetShortcutBinding,
        executeSystemAndPluginCommand: css.executeSystemAndPluginCommand,
    };
}
