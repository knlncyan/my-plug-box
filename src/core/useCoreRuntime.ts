import { useEffect, useSyncExternalStore } from 'react';
import { coreRuntime } from './index';

function useHostRuntime() {
    const snapshot = useSyncExternalStore(coreRuntime.subscribe, coreRuntime.getSnapshot, coreRuntime.getSnapshot);

    useEffect(() => {
        void coreRuntime.initialize();
    }, []);

    return {
        ...snapshot,
        executeCommand: coreRuntime.executeCommand,
        setActiveView: coreRuntime.setActiveView,
        setCommandShortcut: coreRuntime.setCommandShortcut,
        clearCommandShortcut: coreRuntime.clearCommandShortcut,
        registerSystemShortcut: coreRuntime.registerSystemShortcut,
        refreshExternalPlugins: coreRuntime.refreshExternalPlugins,
    };
}

export function useCoreRuntime() {
    return useHostRuntime();
}
