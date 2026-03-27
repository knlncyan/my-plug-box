import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { container, coreRuntime } from '.';
import { WorkerSandboxService } from './service/WorkerSandboxService';
import { createWindowRpcServer } from './utils/communicationUtils';
import { getPluginViewUrl } from './utils/pluginResourceLoader';
import type { PluginViewManifest } from '../domain/protocol/plugin-catalog.protocol';
import type {
    PluginViewExecuteCommandPayload,
    PluginViewInvokeHostMethodPayload,
    PluginViewSetActiveViewPayload,
} from '../domain/protocol/plugin-view-rpc.protocol';

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

const workerSandboxService = container.resolve(WorkerSandboxService);

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

    const viewUrl = getPluginViewUrl(view.pluginId);
    if (viewUrl) {
        url.searchParams.set('viewUrl', viewUrl);
    }

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
        let unsubscribeSubscriptionPush: (() => void) | null = null;

        const getTargetWindow = (): Window | null => iframeRef.current?.contentWindow ?? null;

        const ensureSnapshotSubscription = (rpcServer: ReturnType<typeof createWindowRpcServer>): void => {
            if (unsubscribeSnapshot) return;
            unsubscribeSnapshot = coreRuntime.subscribe(() => {
                const current = getTargetWindow();
                if (!current) return;
                rpcServer.emit('runtime.snapshot', coreRuntime.getSnapshot(), current);
            });
        };

        const clearSnapshotSubscription = (): void => {
            if (!unsubscribeSnapshot) return;
            unsubscribeSnapshot();
            unsubscribeSnapshot = null;
        };

        const rpcServer = createWindowRpcServer({
            channel: 'plugin-view-runtime',
            sourceWindow: getTargetWindow,
            targetWindow: getTargetWindow,
        });

        const unregs = [
            rpcServer.register('getSnapshot', () => coreRuntime.getSnapshot()),
            rpcServer.register('subscribe', () => {
                ensureSnapshotSubscription(rpcServer);
                return coreRuntime.getSnapshot();
            }),
            rpcServer.register('unsubscribe', () => {
                clearSnapshotSubscription();
                return null;
            }),
            rpcServer.register('executeCommand', (payload) => {
                const data = asRecord(payload) as unknown as PluginViewExecuteCommandPayload;
                if (typeof data.commandId !== 'string' || data.commandId.length === 0) {
                    throw new Error('runtime bridge executeCommand missing commandId');
                }
                const args = Array.isArray(data.args) ? data.args : [];
                return coreRuntime.executeCommand(data.commandId, data.options, ...args);
            }),
            rpcServer.register('setActiveView', (payload) => {
                const data = asRecord(payload) as unknown as PluginViewSetActiveViewPayload;
                if (data.viewId !== null && data.viewId !== undefined && typeof data.viewId !== 'string') {
                    throw new Error('runtime bridge setActiveView invalid viewId');
                }
                coreRuntime.setActiveView((data.viewId ?? null) as string | null);
                return null;
            }),
            rpcServer.register('refreshExternalPlugins', async () => {
                await coreRuntime.refreshExternalPlugins();
                return null;
            }),
            rpcServer.register('invokeHostMethod', (payload) => {
                const data = asRecord(payload) as unknown as PluginViewInvokeHostMethodPayload;
                if (typeof data.method !== 'string' || data.method.length === 0) {
                    throw new Error('runtime bridge invokeHostMethod missing method');
                }
                return workerSandboxService.invokeHostMethod(view.pluginId, data.method, data.params);
            }),
        ];

        unsubscribeSubscriptionPush = workerSandboxService.onSubscriptionPush((push) => {
            const targetWindow = getTargetWindow();
            if (!targetWindow) return;
            if (push.pluginId !== view.pluginId) return;

            rpcServer.emit(
                'capability.subscription',
                {
                    subscriptionId: push.subscriptionId,
                    data: push.data,
                },
                targetWindow
            );
        });

        return () => {
            clearSnapshotSubscription();
            if (unsubscribeSubscriptionPush) {
                unsubscribeSubscriptionPush();
                unsubscribeSubscriptionPush = null;
            }
            for (const unreg of unregs) {
                unreg();
            }
            rpcServer.dispose();
        };
    }, [sandboxUrl, view.pluginId]);

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
                sandbox="allow-scripts allow-forms allow-same-origin"
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
