/**
 * 标准化窗口通信工具：
 * 1) WindowRpcClient：请求/响应调用端。
 * 2) WindowRpcServer：方法注册与执行端。
 * 3) EventChannel：本地事件分发（用于客户端或服务端内部复用）。
 */

const WINDOW_RPC_PROTOCOL = 'plug-box-rpc-v1';

type RpcKind = 'request' | 'response' | 'event';

interface WindowRpcBaseMessage {
    protocol: typeof WINDOW_RPC_PROTOCOL;
    channel: string;
    kind: RpcKind;
}

interface WindowRpcRequestMessage extends WindowRpcBaseMessage {
    kind: 'request';
    requestId: string;
    method: string;
    params?: unknown;
}

interface WindowRpcResponseMessage extends WindowRpcBaseMessage {
    kind: 'response';
    requestId: string;
    success: boolean;
    result?: unknown;
    error?: string;
}

interface WindowRpcEventMessage extends WindowRpcBaseMessage {
    kind: 'event';
    event: string;
    payload?: unknown;
}

type WindowRpcWireMessage =
    | WindowRpcRequestMessage
    | WindowRpcResponseMessage
    | WindowRpcEventMessage;

type EventHandler = (payload: unknown) => void;

interface EventChannel {
    on(event: string, handler: EventHandler): () => void;
    emit(event: string, payload?: unknown): void;
    clear(): void;
}

function createEventChannel(): EventChannel {
    const handlersByEvent = new Map<string, Set<EventHandler>>();

    return {
        on(event: string, handler: EventHandler): () => void {
            let handlers = handlersByEvent.get(event);
            if (!handlers) {
                handlers = new Set<EventHandler>();
                handlersByEvent.set(event, handlers);
            }
            handlers.add(handler);
            return () => {
                handlers?.delete(handler);
                if (handlers && handlers.size === 0) {
                    handlersByEvent.delete(event);
                }
            };
        },
        emit(event: string, payload?: unknown): void {
            const handlers = handlersByEvent.get(event);
            if (!handlers) return;
            for (const handler of handlers) {
                handler(payload);
            }
        },
        clear(): void {
            handlersByEvent.clear();
        },
    };
}

interface WindowRpcClientOptions {
    channel: string;
    targetWindow: () => Window | null;
    sourceWindow?: () => Window | null;
    targetOrigin?: string;
    requestTimeoutMs?: number;
    requestIdPrefix?: string;
}

interface PendingRequest {
    timer: ReturnType<typeof setTimeout> | null;
    resolve: (result: unknown) => void;
    reject: (reason?: unknown) => void;
}

export interface WindowRpcClient {
    call<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
    on(event: string, handler: EventHandler): () => void;
    dispose(reason?: string): void;
}

type RpcMethodHandler = (params: unknown, event: MessageEvent<unknown>) => Promise<unknown> | unknown;

interface WindowRpcServerOptions {
    channel: string;
    sourceWindow?: () => Window | null;
    targetWindow?: () => Window | null;
    targetOrigin?: string;
}

export interface WindowRpcServer {
    register(method: string, handler: RpcMethodHandler): () => void;
    emit(event: string, payload?: unknown, targetWindow?: Window | null): void;
    dispose(): void;
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') return {};
    return value as Record<string, unknown>;
}

function isWindowRpcMessage(value: unknown): value is WindowRpcWireMessage {
    const data = asRecord(value);
    return (
        data.protocol === WINDOW_RPC_PROTOCOL &&
        typeof data.channel === 'string' &&
        typeof data.kind === 'string'
    );
}

function asWindow(source: MessageEventSource | null): Window | null {
    if (!source) return null;
    if (typeof Window !== 'undefined' && source instanceof Window) {
        return source;
    }
    // WindowProxy 在 TS 类型里不直接等同 Window，这里按 duck typing 兜底。
    const maybeWindow = source as unknown as { postMessage?: unknown };
    if (typeof maybeWindow.postMessage === 'function') {
        return source as unknown as Window;
    }
    return null;
}

export function createWindowRpcClient(options: WindowRpcClientOptions): WindowRpcClient {
    let disposed = false;
    let serial = 0;
    const pendingRequests = new Map<string, PendingRequest>();
    const eventChannel = createEventChannel();
    const targetOrigin = options.targetOrigin ?? '*';
    const defaultTimeoutMs = options.requestTimeoutMs ?? 10_000;
    const requestIdPrefix = options.requestIdPrefix ?? 'rpc';

    const cleanupPending = (requestId: string): PendingRequest | undefined => {
        const pending = pendingRequests.get(requestId);
        if (!pending) return undefined;
        pendingRequests.delete(requestId);
        if (pending.timer !== null) {
            globalThis.clearTimeout(pending.timer);
        }
        return pending;
    };

    const onMessage = (event: MessageEvent<unknown>): void => {
        if (disposed) return;
        const expectedSource = options.sourceWindow?.();
        if (expectedSource && event.source !== expectedSource) return;
        if (targetOrigin !== '*' && event.origin !== targetOrigin) return;
        if (!isWindowRpcMessage(event.data)) return;

        const message = event.data;
        if (message.channel !== options.channel) return;

        if (message.kind === 'response') {
            const pending = cleanupPending(message.requestId);
            if (!pending) return;
            if (message.success) {
                pending.resolve(message.result);
            } else {
                pending.reject(new Error(message.error ?? 'rpc call failed'));
            }
            return;
        }

        if (message.kind === 'event') {
            eventChannel.emit(message.event, message.payload);
        }
    };

    window.addEventListener('message', onMessage);

    return {
        async call<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
            if (disposed) {
                throw new Error('rpc client disposed');
            }
            const target = options.targetWindow();
            if (!target) {
                throw new Error('rpc target window unavailable');
            }

            serial += 1;
            const requestId = `${requestIdPrefix}:${serial}`;
            const request: WindowRpcRequestMessage = {
                protocol: WINDOW_RPC_PROTOCOL,
                channel: options.channel,
                kind: 'request',
                requestId,
                method,
                params,
            };

            return new Promise<T>((resolve, reject) => {
                const effectiveTimeout = timeoutMs ?? defaultTimeoutMs;
                const timer =
                    effectiveTimeout > 0
                        ? globalThis.setTimeout(() => {
                            cleanupPending(requestId);
                            reject(new Error(`rpc timeout: ${method}`));
                        }, effectiveTimeout)
                        : null;

                pendingRequests.set(requestId, {
                    timer,
                    resolve: (value) => resolve(value as T),
                    reject,
                });

                target.postMessage(request, targetOrigin);
            });
        },
        on(event: string, handler: EventHandler): () => void {
            return eventChannel.on(event, handler);
        },
        dispose(reason = 'rpc client disposed'): void {
            if (disposed) return;
            disposed = true;

            window.removeEventListener('message', onMessage);
            eventChannel.clear();

            for (const [requestId, pending] of pendingRequests.entries()) {
                pendingRequests.delete(requestId);
                if (pending.timer !== null) {
                    globalThis.clearTimeout(pending.timer);
                }
                pending.reject(new Error(reason));
            }
        },
    };
}

export function createWindowRpcServer(options: WindowRpcServerOptions): WindowRpcServer {
    const methodHandlers = new Map<string, RpcMethodHandler>();
    const targetOrigin = options.targetOrigin ?? '*';

    const sendResponse = (
        request: WindowRpcRequestMessage,
        sourceEvent: MessageEvent<unknown>,
        success: boolean,
        result?: unknown,
        error?: string
    ): void => {
        const target = options.targetWindow?.() ?? asWindow(sourceEvent.source);
        if (!target) return;

        const response: WindowRpcResponseMessage = {
            protocol: WINDOW_RPC_PROTOCOL,
            channel: options.channel,
            kind: 'response',
            requestId: request.requestId,
            success,
            result,
            error,
        };
        target.postMessage(response, targetOrigin);
    };

    const onMessage = (event: MessageEvent<unknown>): void => {
        const expectedSource = options.sourceWindow?.();
        if (expectedSource && event.source !== expectedSource) return;
        if (targetOrigin !== '*' && event.origin !== targetOrigin) return;
        if (!isWindowRpcMessage(event.data)) return;

        const message = event.data;
        if (message.channel !== options.channel || message.kind !== 'request') return;

        const handler = methodHandlers.get(message.method);
        if (!handler) {
            sendResponse(message, event, false, undefined, `rpc method not found: ${message.method}`);
            return;
        }

        Promise.resolve(handler(message.params, event))
            .then((result) => {
                sendResponse(message, event, true, result);
            })
            .catch((error) => {
                sendResponse(
                    message,
                    event,
                    false,
                    undefined,
                    error instanceof Error ? error.message : String(error)
                );
            });
    };

    window.addEventListener('message', onMessage);

    return {
        register(method: string, handler: RpcMethodHandler): () => void {
            methodHandlers.set(method, handler);
            return () => {
                methodHandlers.delete(method);
            };
        },
        emit(event: string, payload?: unknown, targetWindow?: Window | null): void {
            const target = targetWindow ?? options.targetWindow?.();
            if (!target) return;

            const message: WindowRpcEventMessage = {
                protocol: WINDOW_RPC_PROTOCOL,
                channel: options.channel,
                kind: 'event',
                event,
                payload,
            };
            target.postMessage(message, targetOrigin);
        },
        dispose(): void {
            window.removeEventListener('message', onMessage);
            methodHandlers.clear();
        },
    };
}

type WorkerMessageListener = (event: MessageEvent<unknown>) => void;

export interface WorkerRpcEndpoint {
    postMessage(message: unknown): void;
    addEventListener(type: 'message', listener: WorkerMessageListener): void;
    removeEventListener(type: 'message', listener: WorkerMessageListener): void;
}

interface WorkerRpcClientOptions {
    channel: string;
    endpoint: WorkerRpcEndpoint;
    requestTimeoutMs?: number;
    requestIdPrefix?: string;
}

export interface WorkerRpcClient {
    call<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
    on(event: string, handler: EventHandler): () => void;
    dispose(reason?: string): void;
}

interface WorkerRpcServerOptions {
    channel: string;
    endpoint: WorkerRpcEndpoint;
}

export interface WorkerRpcServer {
    register(method: string, handler: (params: unknown) => Promise<unknown> | unknown): () => void;
    emit(event: string, payload?: unknown): void;
    dispose(): void;
}

export function createWorkerRpcClient(options: WorkerRpcClientOptions): WorkerRpcClient {
    let disposed = false;
    let serial = 0;
    const pendingRequests = new Map<string, PendingRequest>();
    const eventChannel = createEventChannel();
    const defaultTimeoutMs = options.requestTimeoutMs ?? 10_000;
    const requestIdPrefix = options.requestIdPrefix ?? 'worker-rpc';

    const cleanupPending = (requestId: string): PendingRequest | undefined => {
        const pending = pendingRequests.get(requestId);
        if (!pending) return undefined;
        pendingRequests.delete(requestId);
        if (pending.timer !== null) {
            globalThis.clearTimeout(pending.timer);
        }
        return pending;
    };

    const onMessage: WorkerMessageListener = (event) => {
        if (disposed) return;
        if (!isWindowRpcMessage(event.data)) return;

        const message = event.data;
        if (message.channel !== options.channel) return;

        if (message.kind === 'response') {
            const pending = cleanupPending(message.requestId);
            if (!pending) return;
            if (message.success) {
                pending.resolve(message.result);
            } else {
                pending.reject(new Error(message.error ?? 'worker rpc call failed'));
            }
            return;
        }

        if (message.kind === 'event') {
            eventChannel.emit(message.event, message.payload);
        }
    };

    options.endpoint.addEventListener('message', onMessage);

    return {
        async call<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
            if (disposed) {
                throw new Error('worker rpc client disposed');
            }

            serial += 1;
            const requestId = `${requestIdPrefix}:${serial}`;
            const request: WindowRpcRequestMessage = {
                protocol: WINDOW_RPC_PROTOCOL,
                channel: options.channel,
                kind: 'request',
                requestId,
                method,
                params,
            };

            return new Promise<T>((resolve, reject) => {
                const effectiveTimeout = timeoutMs ?? defaultTimeoutMs;
                const timer =
                    effectiveTimeout > 0
                        ? globalThis.setTimeout(() => {
                              cleanupPending(requestId);
                              reject(new Error(`worker rpc timeout: ${method}`));
                          }, effectiveTimeout)
                        : null;

                pendingRequests.set(requestId, {
                    timer,
                    resolve: (value) => resolve(value as T),
                    reject,
                });

                options.endpoint.postMessage(request);
            });
        },
        on(event: string, handler: EventHandler): () => void {
            return eventChannel.on(event, handler);
        },
        dispose(reason = 'worker rpc client disposed'): void {
            if (disposed) return;
            disposed = true;

            options.endpoint.removeEventListener('message', onMessage);
            eventChannel.clear();

            for (const [requestId, pending] of pendingRequests.entries()) {
                pendingRequests.delete(requestId);
                if (pending.timer !== null) {
                    globalThis.clearTimeout(pending.timer);
                }
                pending.reject(new Error(reason));
            }
        },
    };
}

export function createWorkerRpcServer(options: WorkerRpcServerOptions): WorkerRpcServer {
    const methodHandlers = new Map<string, (params: unknown) => Promise<unknown> | unknown>();

    const sendResponse = (
        request: WindowRpcRequestMessage,
        success: boolean,
        result?: unknown,
        error?: string
    ): void => {
        const response: WindowRpcResponseMessage = {
            protocol: WINDOW_RPC_PROTOCOL,
            channel: options.channel,
            kind: 'response',
            requestId: request.requestId,
            success,
            result,
            error,
        };
        options.endpoint.postMessage(response);
    };

    const onMessage: WorkerMessageListener = (event) => {
        if (!isWindowRpcMessage(event.data)) return;

        const message = event.data;
        if (message.channel !== options.channel || message.kind !== 'request') return;

        const handler = methodHandlers.get(message.method);
        if (!handler) {
            sendResponse(message, false, undefined, `worker rpc method not found: ${message.method}`);
            return;
        }

        Promise.resolve(handler(message.params))
            .then((result) => {
                sendResponse(message, true, result);
            })
            .catch((error) => {
                sendResponse(
                    message,
                    false,
                    undefined,
                    error instanceof Error ? error.message : String(error)
                );
            });
    };

    options.endpoint.addEventListener('message', onMessage);

    return {
        register(method: string, handler: (params: unknown) => Promise<unknown> | unknown): () => void {
            methodHandlers.set(method, handler);
            return () => {
                methodHandlers.delete(method);
            };
        },
        emit(event: string, payload?: unknown): void {
            const message: WindowRpcEventMessage = {
                protocol: WINDOW_RPC_PROTOCOL,
                channel: options.channel,
                kind: 'event',
                event,
                payload,
            };
            options.endpoint.postMessage(message);
        },
        dispose(): void {
            options.endpoint.removeEventListener('message', onMessage);
            methodHandlers.clear();
        },
    };
}
