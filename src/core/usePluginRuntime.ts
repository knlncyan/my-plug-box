/**
 * React 侧运行时入口 Hook：
 * 1) 主应用环境：直接订阅 pluginRuntime。
 * 2) 视图沙箱环境：通过 postMessage 桥接到主线程 runtime。
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { pluginRuntime, type ExecuteCommandOptions, type PluginRuntimeSnapshot } from './pluginRuntime';
import type {
  PluginViewActivateForViewPayload,
  PluginViewExecuteCommandPayload,
  PluginViewRuntimeRequestMessage,
  PluginViewSetActiveViewPayload,
} from './pluginViewRuntimeBridge.protocol';

declare global {
  interface Window {
    __PLUGIN_VIEW_SANDBOX__?: boolean;
  }
}

const EMPTY_SNAPSHOT: PluginRuntimeSnapshot = {
  loading: true,
  ready: false,
  error: null,
  activeViewId: null,
  plugins: [],
  views: [],
  commands: [],
};

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

function isPluginViewSandbox(): boolean {
  return window.__PLUGIN_VIEW_SANDBOX__ === true;
}

function useHostPluginRuntime() {
  const snapshot = useSyncExternalStore(
    pluginRuntime.subscribe,
    pluginRuntime.getSnapshot,
    pluginRuntime.getSnapshot
  );

  useEffect(() => {
    void pluginRuntime.initialize();
  }, []);

  return {
    ...snapshot,
    executeCommand: pluginRuntime.executeCommand,
    activateForView: pluginRuntime.activateForView,
    setActiveView: pluginRuntime.setActiveView,
  };
}

function useSandboxPluginRuntime() {
  const [snapshot, setSnapshot] = useState<PluginRuntimeSnapshot>(EMPTY_SNAPSHOT);
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
        setSnapshot(data.snapshot as PluginRuntimeSnapshot);
      }
    }

    window.addEventListener('message', handleMessage);

    void callParent('getSnapshot')
      .then((value) => {
        setSnapshot(value as PluginRuntimeSnapshot);
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

  const activateForView = useCallback(
    async (viewId: string): Promise<void> => {
      const payload: PluginViewActivateForViewPayload = { viewId };
      await callParent('activateForView', payload);
    },
    [callParent]
  );

  return {
    ...snapshot,
    executeCommand,
    activateForView,
    setActiveView,
  };
}

export function usePluginRuntime() {
  if (isPluginViewSandbox()) {
    return useSandboxPluginRuntime();
  }
  return useHostPluginRuntime();
}
