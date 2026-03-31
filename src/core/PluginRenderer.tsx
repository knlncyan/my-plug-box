import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { container, coreRuntime } from '.';
import { CommandKeybindingService } from './service/CommandKeybindingService';
import { WorkerSandboxService } from './service/WorkerSandboxService';
import { createWindowRpcServer } from './utils/communicationUtils';
import type { PluginEntry } from '../domain/protocol/plugin-catalog.protocol';
import type {
    PluginViewInvokeHostMethodPayload,
    PluginViewLocalShortcutKeydownPayload,
} from '../domain/protocol/plugin-view-rpc.protocol';

interface Props {
    plugin: PluginEntry;
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
const commandKeybindingService = container.resolve(CommandKeybindingService);

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

function asLocalShortcutPayload(value: unknown): PluginViewLocalShortcutKeydownPayload | null {
    const data = asRecord(value);
    if (typeof data.code !== 'string') return null;

    const toBool = (key: string): boolean => data[key] === true;

    return {
        code: data.code,
        ctrlKey: toBool('ctrlKey'),
        altKey: toBool('altKey'),
        shiftKey: toBool('shiftKey'),
        metaKey: toBool('metaKey'),
        repeat: toBool('repeat'),
        isComposing: toBool('isComposing'),
        defaultPrevented: toBool('defaultPrevented'),
        targetIsEditable: toBool('targetIsEditable'),
    };
}

function buildSandboxViewUrl(plugin: PluginEntry): string {
    const view = plugin.viewMeta!!;
    const url = new URL('/plugin-view-sandbox.html', window.location.origin);
    url.searchParams.set('viewId', view.id);
    url.searchParams.set('pluginId', view.pluginId);
    url.searchParams.set('props', JSON.stringify(view.props ?? {}));

    const viewUrl = plugin.viewUrl;
    if (viewUrl) {
        url.searchParams.set('viewUrl', viewUrl);
    }

    return url.toString();
}

function PluginSandboxFrame({ plugin }: Props) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [frameError, setFrameError] = useState<string | null>(null);

    const sandboxUrl = useMemo(
        () => buildSandboxViewUrl(plugin),
        [plugin.pluginId, JSON.stringify(plugin?.viewMeta?.props ?? {})]
    );

    useEffect(() => {
        let unsubscribeSubscriptionPush: (() => void) | null = null;

        const getTargetWindow = (): Window | null => iframeRef.current?.contentWindow ?? null;

        const rpcServer = createWindowRpcServer({
            channel: 'plugin-view-runtime',
            sourceWindow: getTargetWindow,
            targetWindow: getTargetWindow,
        });

        const unregs = [
            rpcServer.register('refreshExternalPlugins', async () => {
                await coreRuntime.refresh();
                return null;
            }),
            rpcServer.register('invokeHostMethod', (payload) => {
                const data = asRecord(payload) as unknown as PluginViewInvokeHostMethodPayload;
                if (typeof data.method !== 'string' || data.method.length === 0) {
                    throw new Error('runtime bridge invokeHostMethod missing method');
                }
                return workerSandboxService.invokeHostMethod(plugin.pluginId, data.method, data.params);
            }),
            rpcServer.register('handleLocalShortcutKeydown', (payload) => {
                const keydownPayload = asLocalShortcutPayload(payload);
                if (!keydownPayload) {
                    return false;
                }
                return commandKeybindingService.handleLocalShortcutKeydown(keydownPayload);
            }),
        ];

        unsubscribeSubscriptionPush = workerSandboxService.onSubscriptionPush((push) => {
            const targetWindow = getTargetWindow();
            if (!targetWindow) return;
            if (push.pluginId !== plugin.pluginId) return;

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
            if (unsubscribeSubscriptionPush) {
                unsubscribeSubscriptionPush();
                unsubscribeSubscriptionPush = null;
            }
            for (const unreg of unregs) {
                unreg();
            }
            rpcServer.dispose();
        };
    }, [sandboxUrl, plugin.pluginId]);

    return (
        <div className="h-full w-full">
            {frameError ? (
                <div className="p-4 text-sm text-red-700">
                    Plugin sandbox failed ({plugin.pluginId}): {frameError}
                </div>
            ) : null}
            <iframe
                key={sandboxUrl}
                ref={iframeRef}
                src={sandboxUrl}
                title={`plugin-view-${plugin.viewMeta?.id ?? 'none'}`}
                sandbox="allow-scripts allow-forms allow-same-origin"
                className="h-full w-full border-0"
                onLoad={() => setFrameError(null)}
                onError={() => setFrameError('Failed to load plugin sandbox iframe')}
            />
        </div>
    );
}

export function PluginViewLoader({ plugin }: Props) {
    return (
        <PluginViewErrorBoundary pluginId={plugin.pluginId} viewId={plugin?.viewMeta?.id ?? 'none'}>
            <PluginSandboxFrame plugin={plugin} />
        </PluginViewErrorBoundary>
    );
}

