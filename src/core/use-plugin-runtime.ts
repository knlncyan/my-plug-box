/**
 * React hook binding to plugin runtime store and runtime actions.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { pluginRuntime } from './plugin-runtime';

export function usePluginRuntime() {
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
