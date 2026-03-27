import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { coreRuntime } from './index';
import { createWindowRpcClient, type WindowRpcClient } from './utils/communicationUtils';
import type { ExecuteCommandOptions, PluginRuntimeSnapshot } from '../domain/runtime';
import type {
    PluginViewExecuteCommandPayload,
    PluginViewSetActiveViewPayload,
} from '../domain/protocol/plugin-view-rpc.protocol';

declare global {
    interface Window {
        __PLUGIN_VIEW_SANDBOX__?: boolean;
    }
}

const EMPTY_SNAPSHOT: PluginRuntimeSnapshot = {
    loading: true,
    ready: false,
    error: null,
    activeViewPluginId: null,
    plugins: [],
    commands: [],
};

function isPluginViewSandbox(): boolean {
    return window.__PLUGIN_VIEW_SANDBOX__ === true;
}

function useHostRuntime() {
    const snapshot = useSyncExternalStore(coreRuntime.subscribe, coreRuntime.getSnapshot, coreRuntime.getSnapshot);

    useEffect(() => {
        void coreRuntime.initialize();
    }, []);

    return {
        ...snapshot,
        executeCommand: coreRuntime.executeCommand,
        setActiveView: coreRuntime.setActiveView,
        refreshExternalPlugins: coreRuntime.refreshExternalPlugins,
    };
}

function useSandboxRuntime() {
    const [snapshot, setSnapshot] = useState<PluginRuntimeSnapshot>(EMPTY_SNAPSHOT);

    const rpcClient = useMemo<WindowRpcClient>(
        () =>
            createWindowRpcClient({
                channel: 'plugin-view-runtime',
                requestIdPrefix: 'sandbox',
                requestTimeoutMs: 10_000,
                targetWindow: () => window.parent,
                sourceWindow: () => window.parent,
            }),
        []
    );

    useEffect(() => {
        const disposeSnapshotListener = rpcClient.on('runtime.snapshot', (nextSnapshot) => {
            setSnapshot(nextSnapshot as PluginRuntimeSnapshot);
        });

        void rpcClient
            .call<PluginRuntimeSnapshot>('getSnapshot')
            .then((value) => {
                setSnapshot(value);
            })
            .catch((error) => {
                setSnapshot((prev) => ({ ...prev, loading: false, ready: false, error: String(error) }));
            });

        void rpcClient.call('subscribe');

        return () => {
            disposeSnapshotListener();
            void rpcClient.call('unsubscribe').catch(() => undefined);
            rpcClient.dispose();
        };
    }, [rpcClient]);

    const executeCommand = async (commandId: string, options?: ExecuteCommandOptions, ...args: unknown[]) => {
        const payload: PluginViewExecuteCommandPayload = { commandId, args, options };
        return rpcClient.call('executeCommand', payload);
    };

    const setActiveView = (viewId: string | null): void => {
        const payload: PluginViewSetActiveViewPayload = { viewId };
        void rpcClient.call('setActiveView', payload);
    };

    const refreshExternalPlugins = async (): Promise<void> => {
        await rpcClient.call('refreshExternalPlugins');
    };

    return {
        ...snapshot,
        executeCommand,
        setActiveView,
        refreshExternalPlugins,
    };
}

/**
 * 閹绘帊娆㈡潻鎰攽閺?Hook 閸忋儱褰涢敍? * - 娑撹绨查悽銊у箚婢у喛绱伴惄瀛樺复鐠併垽妲勯弽绋跨妇鏉╂劘顢戦弮鑸垫箛閸斅扳偓? * - 鐟欏棗娴樺▽娆戭唸閻滎垰顣ㄩ敍姘垛偓姘崇箖 WindowRpcClient 鐠嬪啰鏁ゆ稉鑽ゅ殠缁嬪绻嶇悰灞炬閼宠棄濮忛妴? */
export function useCoreRuntime() {
    if (isPluginViewSandbox()) {
        return useSandboxRuntime();
    }
    return useHostRuntime();
}

