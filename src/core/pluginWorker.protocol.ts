/**
 * 插件 Worker 与主线程的通信协议。
 * 约定:
 * 1) `host-*` 消息: 主线程主动请求 Worker 执行动作。
 * 2) `worker-*` 消息: Worker 主动请求主线程提供宿主能力。
 * 3) `host-event`: 主线程推送订阅回调事件给 Worker。
 */

export type HostRequestAction = 'init' | 'activate' | 'deactivate' | 'execute';

export type WorkerRequestAction =
  | 'commands.execute'
  | 'views.activate'
  | 'events.emit'
  | 'events.on'
  | 'events.off'
  | 'settings.get'
  | 'settings.set'
  | 'settings.onChange'
  | 'settings.offChange'
  | 'storage.get'
  | 'storage.set';

export interface HostRequestMessage {
  type: 'host-request';
  requestId: string;
  action: HostRequestAction;
  payload?: unknown;
}

export interface HostResponseMessage {
  type: 'host-response';
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface WorkerRequestMessage {
  type: 'worker-request';
  requestId: string;
  action: WorkerRequestAction;
  payload?: unknown;
}

export interface WorkerResponseMessage {
  type: 'worker-response';
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface HostEventMessage {
  type: 'host-event';
  subscriptionId: string;
  payload: unknown;
}

export type MessageFromHost =
  | HostRequestMessage
  | WorkerResponseMessage
  | HostEventMessage;

export type MessageFromWorker =
  | HostResponseMessage
  | WorkerRequestMessage;

