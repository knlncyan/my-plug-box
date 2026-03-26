import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { coreRuntime } from './index';
import type { ExecuteCommandOptions } from '../domain/runtime';
import type {
    PluginViewExecuteCommandPayload,
    PluginViewRuntimeRequestMessage,
    PluginViewSetActiveViewPayload,
} from '../domain/protocol/plugin-view-runtime-bridge.protocol';

type CoreRuntimeSnapshot = ReturnType<typeof coreRuntime.getSnapshot>;

declare global {
    interface Window {
        __PLUGIN_VIEW_SANDBOX__?: boolean;
    }
}

const EMPTY_SNAPSHOT: CoreRuntimeSnapshot = {
    loading: true,
    ready: false,
    error: null,
    activeViewPluginId: null,
    plugins: [],
    commands: [],
};

interface PendingCall {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
}

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
    const [snapshot, setSnapshot] = useState<CoreRuntimeSnapshot>(EMPTY_SNAPSHOT);
    const pendingRef = useRef(new Map<string, PendingCall>());
    const requestSerialRef = useRef(0);

    const callParent = useCallback(
        (action: PluginViewRuntimeRequestMessage['action'], payload?: unknown): Promise<unknown> => {
            requestSerialRef.current += 1;
            const requestId = `sandbox:${requestSerialRef.current}`;
            const message: PluginViewRuntimeRequestMessage = {
                type: 'plugin-view-runtime-request',
                requestId,
                action,
                payload,
            };

            return new Promise((resolve, reject) => {
                pendingRef.current.set(requestId, { resolve, reject });
                window.parent.postMessage(message, '*');
            });
        },
        []
    );

    useEffect(() => {
        function handleMessage(event: MessageEvent<unknown>): void {
            const data = event.data as { type?: unknown } & Record<string, unknown>;
            if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;

            if (data.type === 'plugin-view-runtime-response') {
                const requestId = data.requestId;
                if (typeof requestId !== 'string') return;
                const pending = pendingRef.current.get(requestId);
                if (!pending) return;

                pendingRef.current.delete(requestId);
                if (data.success === true) {
                    pending.resolve(data.result);
                } else {
                    pending.reject(new Error(String(data.error ?? 'runtime bridge request failed')));
                }
                return;
            }

            if (data.type === 'plugin-view-runtime-snapshot' && data.snapshot) {
                setSnapshot(data.snapshot as CoreRuntimeSnapshot);
            }
        }

        window.addEventListener('message', handleMessage);

        void callParent('getSnapshot')
            .then((value) => {
                setSnapshot(value as CoreRuntimeSnapshot);
            })
            .catch((error) => {
                setSnapshot((prev) => ({ ...prev, loading: false, ready: false, error: String(error) }));
            });

        void callParent('subscribe');

        return () => {
            window.removeEventListener('message', handleMessage);
            void callParent('unsubscribe');

            for (const pending of pendingRef.current.values()) {
                pending.reject(new Error('runtime bridge disposed'));
            }
            pendingRef.current.clear();
        };
    }, [callParent]);

    const executeCommand = useCallback(
        async (commandId: string, options?: ExecuteCommandOptions, ...args: unknown[]) => {
            const payload: PluginViewExecuteCommandPayload = { commandId, args, options };
            return callParent('executeCommand', payload);
        },
        [callParent]
    );

    const setActiveView = useCallback(
        (viewId: string | null): void => {
            const payload: PluginViewSetActiveViewPayload = { viewId };
            void callParent('setActiveView', payload);
        },
        [callParent]
    );

    const refreshExternalPlugins = useCallback(async (): Promise<void> => {
        await callParent('refreshExternalPlugins');
    }, [callParent]);
    return {
        ...snapshot,
        executeCommand,
        setActiveView,
        refreshExternalPlugins,
    };
}

/**
 * 插件运行时 Hook 入口：
 * - 主应用环境：直接订阅核心运行时服务。
 * - 视图沙箱环境：通过 postMessage 桥接主线程运行时能力。
 */
export function useCoreRuntime() {
    if (isPluginViewSandbox()) {
        return useSandboxRuntime();
    }
    return useHostRuntime();
}

