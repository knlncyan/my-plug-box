/**
 * Worker 协议类型：定义宿主与插件 Worker 之间的消息结构。
 */
export interface PendingRequest {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
}

export interface PluginWorkerRecord {
    pluginId: string;
    worker: Worker;
    active: boolean;
    pendingRequests: Map<string, PendingRequest>;
}

// 宿主 -> Worker 请求动作
export type HostRequestAction = 'init' | 'activate' | 'deactivate' | 'execute-command';

export interface HostMessagePayload extends Record<string, unknown> {
    pluginId: string;
    moduleUrl?: string;
}

export interface HostRequestMessage {
    type: 'host-request';
    requestId: string;
    action: HostRequestAction;
    payload: HostMessagePayload;
}

export interface HostResponseMessage {
    type: 'host-response';
    requestId: string;
    result?: unknown;
    error?: string;
}

// Worker -> 宿主通用请求（插件主动调用宿主能力）
export interface WorkerRequestMessage {
    type: 'worker-request';
    requestId: string;
    method: string;
    params?: unknown;
}

export interface WorkerResponseMessage {
    type: 'worker-response';
    requestId: string;
    result?: unknown;
    error?: string;
}

// 宿主主动向 Worker 推送事件
export interface HostEventMessage {
    type: 'host-event';
    event: string;
    payload?: unknown;
}
