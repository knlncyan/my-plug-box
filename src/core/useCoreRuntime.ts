import { useEffect, useSyncExternalStore } from 'react';
import { container } from './index';
import { PluginRuntimeService } from './service/PluginRuntimeService';

export function useCoreRuntime() {
    const coreRuntime = container.resolve(PluginRuntimeService);

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
    };
}
