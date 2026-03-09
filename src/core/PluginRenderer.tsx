/**
 * 插件视图渲染器（基于 iframe 沙箱）。
 * 说明：
 * 1) 每个视图在独立 iframe 内渲染，避免直接污染宿主 DOM。
 * 2) 视图通过 postMessage 向主线程请求 runtime 能力。
 */
import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { coreRuntime } from '.';
import type { PluginViewManifest } from '../domain/protocol/plugin-catalog.protocol';
import type {
    PluginViewExecuteCommandPayload,
    PluginViewRuntimeRequestMessage,
    PluginViewRuntimeResponseMessage,
    PluginViewRuntimeSnapshotMessage,
    PluginViewSetActiveViewPayload,
} from '../domain/protocol/plugin-view-runtime-bridge.protocol';

interface Props {
    view: PluginViewManifest;
}

interface ErrorBoundaryProps {
    pluginId: string;
    viewId: string;
    children: ReactNode;
}

interface ErrorBoundaryState {
    error: string | null;
}

class PluginViewErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
        return { error: String(error) };
    }

    componentDidCatch(error: unknown, info: ErrorInfo): void {
        console.error(
            `[plugin-sandbox] view crashed: plugin=${this.props.pluginId}, view=${this.props.viewId}`,
            error,
            info
        );
    }

    componentDidUpdate(prevProps: ErrorBoundaryProps): void {
        if (prevProps.viewId !== this.props.viewId && this.state.error) {
            this.setState({ error: null });
        }
    }

    render() {
        if (this.state.error) {
            return (
                <div className="p-4 text-sm text-red-700">
                    Plugin view crashed ({this.props.viewId}): {this.state.error}
                </div>
            );
        }
        return this.props.children;
    }
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') return {};
    return value as Record<string, unknown>;
}

function buildSandboxViewUrl(view: PluginViewManifest): string {
    const url = new URL('/plugin-view-sandbox.html', window.location.origin);
    url.searchParams.set('viewId', view.id);
    url.searchParams.set('pluginId', view.pluginId);
    url.searchParams.set('props', JSON.stringify(view.props ?? {}));
    return url.toString();
}

function PluginSandboxFrame({ view }: Props) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [frameError, setFrameError] = useState<string | null>(null);

    const sandboxUrl = useMemo(
        () => buildSandboxViewUrl(view),
        [view.id, view.pluginId, JSON.stringify(view.props ?? {})]
    );

    useEffect(() => {
        let unsubscribeSnapshot: (() => void) | null = null;

        function postSnapshot(targetWindow: Window): void {
            const message: PluginViewRuntimeSnapshotMessage = {
                type: 'plugin-view-runtime-snapshot',
                snapshot: coreRuntime.getSnapshot() as unknown as PluginViewRuntimeSnapshotMessage['snapshot'],
            };
            targetWindow.postMessage(message, '*');
        }

        function postResponse(
            targetWindow: Window,
            response: PluginViewRuntimeResponseMessage
        ): void {
            targetWindow.postMessage(response, '*');
        }

        async function handleRuntimeRequest(
            targetWindow: Window,
            message: PluginViewRuntimeRequestMessage
        ): Promise<void> {
            try {
                switch (message.action) {
                    case 'getSnapshot': {
                        postResponse(targetWindow, {
                            type: 'plugin-view-runtime-response',
                            requestId: message.requestId,
                            success: true,
                            result: coreRuntime.getSnapshot(),
                        });
                        return;
                    }
                    case 'subscribe': {
                        if (!unsubscribeSnapshot) {
                            unsubscribeSnapshot = coreRuntime.subscribe(() => {
                                const current = iframeRef.current?.contentWindow;
                                if (!current) return;
                                postSnapshot(current);
                            });
                        }
                        postSnapshot(targetWindow);
                        postResponse(targetWindow, {
                            type: 'plugin-view-runtime-response',
                            requestId: message.requestId,
                            success: true,
                            result: null,
                        });
                        return;
                    }
                    case 'unsubscribe': {
                        if (unsubscribeSnapshot) {
                            unsubscribeSnapshot();
                            unsubscribeSnapshot = null;
                        }
                        postResponse(targetWindow, {
                            type: 'plugin-view-runtime-response',
                            requestId: message.requestId,
                            success: true,
                            result: null,
                        });
                        return;
                    }
                    case 'executeCommand': {
                        const payload = asRecord(message.payload) as unknown as PluginViewExecuteCommandPayload;
                        if (typeof payload.commandId !== 'string' || payload.commandId.length === 0) {
                            throw new Error('runtime bridge executeCommand missing commandId');
                        }
                        const args = Array.isArray(payload.args) ? payload.args : [];
                        const result = await coreRuntime.executeCommand(
                            payload.commandId,
                            payload.options,
                            ...args
                        );

                        postResponse(targetWindow, {
                            type: 'plugin-view-runtime-response',
                            requestId: message.requestId,
                            success: true,
                            result,
                        });
                        return;
                    }
                    case 'setActiveView': {
                        const payload = asRecord(message.payload) as unknown as PluginViewSetActiveViewPayload;
                        if (
                            payload.viewId !== null &&
                            payload.viewId !== undefined &&
                            typeof payload.viewId !== 'string'
                        ) {
                            throw new Error('runtime bridge setActiveView invalid viewId');
                        }
                        coreRuntime.setActiveView((payload.viewId ?? null) as string | null);
                        postResponse(targetWindow, {
                            type: 'plugin-view-runtime-response',
                            requestId: message.requestId,
                            success: true,
                            result: null,
                        });
                        return;
                    }
                    default:
                        throw new Error(`runtime bridge unsupported action: ${message.action}`);
                }
            } catch (error) {
                postResponse(targetWindow, {
                    type: 'plugin-view-runtime-response',
                    requestId: message.requestId,
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        function onWindowMessage(event: MessageEvent<unknown>): void {
            const targetWindow = iframeRef.current?.contentWindow;
            if (!targetWindow || event.source !== targetWindow) return;

            const data = event.data as Partial<PluginViewRuntimeRequestMessage>;
            if (!data || data.type !== 'plugin-view-runtime-request') return;
            if (typeof data.requestId !== 'string' || typeof data.action !== 'string') return;

            void handleRuntimeRequest(targetWindow, data as PluginViewRuntimeRequestMessage);
        }

        window.addEventListener('message', onWindowMessage);
        return () => {
            window.removeEventListener('message', onWindowMessage);
            if (unsubscribeSnapshot) {
                unsubscribeSnapshot();
                unsubscribeSnapshot = null;
            }
        };
    }, [sandboxUrl]);

    return (
        <div className="h-full w-full">
            {frameError ? (
                <div className="p-4 text-sm text-red-700">
                    Plugin sandbox failed ({view.id}): {frameError}
                </div>
            ) : null}
            <iframe
                key={sandboxUrl}
                ref={iframeRef}
                src={sandboxUrl}
                title={`plugin-view-${view.id}`}
                sandbox="allow-scripts"
                className="h-full w-full border-0"
                onLoad={() => setFrameError(null)}
                onError={() => setFrameError('Failed to load plugin sandbox iframe')}
            />
        </div>
    );
}

export function PluginViewLoader({ view }: Props) {
    return (
        <PluginViewErrorBoundary pluginId={view.pluginId} viewId={view.id}>
            <PluginSandboxFrame view={view} />
        </PluginViewErrorBoundary>
    );
}
