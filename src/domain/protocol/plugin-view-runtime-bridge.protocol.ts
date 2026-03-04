/**
 * 插件视图沙箱与主线程运行时的桥接通信协议。
 */
import type { ExecuteCommandOptions, PluginRuntimeSnapshot } from '../runtime';

export type PluginViewRuntimeAction =
  | 'getSnapshot'
  | 'subscribe'
  | 'unsubscribe'
  | 'executeCommand'
  | 'setActiveView'
  | 'activateForView';

export interface PluginViewRuntimeRequestMessage {
  type: 'plugin-view-runtime-request';
  requestId: string;
  action: PluginViewRuntimeAction;
  payload?: unknown;
}

export interface PluginViewRuntimeResponseMessage {
  type: 'plugin-view-runtime-response';
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface PluginViewRuntimeSnapshotMessage {
  type: 'plugin-view-runtime-snapshot';
  snapshot: PluginRuntimeSnapshot;
}

export interface PluginViewExecuteCommandPayload {
  commandId: string;
  args?: unknown[];
  options?: ExecuteCommandOptions;
}

export interface PluginViewSetActiveViewPayload {
  viewId: string | null;
}

export interface PluginViewActivateForViewPayload {
  viewId: string;
}
