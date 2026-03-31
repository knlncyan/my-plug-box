import * as React from 'react';
import { Component, type ComponentType, type ErrorInfo, type ReactNode, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../../index.css';
import type {
    EventsCapability,
    PluginDisposable,
    PluginHostAPI,
    SettingsCapability,
} from '../../domain/api';
import type { CapabilityById, CapabilityContract } from '../../domain/capability';
import type { PluginViewLocalShortcutKeydownPayload } from '../../domain/protocol/plugin-view-rpc.protocol';
import { createWindowRpcClient } from '../utils/communicationUtils';
import { importPluginAssetByUrl } from '../utils/pluginUtils';

declare global {
    interface Window {
        React?: typeof React;
        __PLUG_BOX_API_FACTORY__?: () => Promise<PluginHostAPI>;
    }
}

interface SandboxParams {
    viewId: string;
    pluginId: string;
    viewUrl: string | null;
    props: Record<string, unknown>;
}

interface ErrorBoundaryProps {
    viewId: string;
    children: ReactNode;
}

interface ErrorBoundaryState {
    error: string | null;
}

class SandboxErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
        return { error: String(error) };
    }

    componentDidCatch(error: unknown, info: ErrorInfo): void {
        console.error(`[plugin-view-sandbox] view crashed: ${this.props.viewId}`, error, info);
    }

    render() {
        if (this.state.error) {
            return (
                <div style={{ padding: 12, color: '#b91c1c', fontSize: 12 }}>
                    Plugin view crashed ({this.props.viewId}): {this.state.error}
                </div>
            );
        }
        return this.props.children;
    }
}

function parseParams(): SandboxParams {
    const params = new URLSearchParams(window.location.search);
    const viewId = params.get('viewId') ?? '';
    const pluginId = params.get('pluginId') ?? '';
    const viewUrlRaw = params.get('viewUrl');
    const viewUrl = viewUrlRaw && viewUrlRaw.length > 0 ? viewUrlRaw : null;
    const rawProps = params.get('props') ?? '{}';

    let props: Record<string, unknown> = {};
    try {
        const parsed = JSON.parse(rawProps);
        if (parsed && typeof parsed === 'object') {
            props = parsed as Record<string, unknown>;
        }
    } catch {
        props = {};
    }

    return { viewId, pluginId, viewUrl, props };
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') return {};
    return value as Record<string, unknown>;
}

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;

    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
}

function createSandboxPluginApi(params: SandboxParams): PluginHostAPI {
    const rpcClient = createWindowRpcClient({
        channel: 'plugin-view-runtime',
        requestIdPrefix: 'view-sdk',
        requestTimeoutMs: 10_000,
        targetWindow: () => window.parent,
        sourceWindow: () => window.parent,
    });

    const capabilityCache = new Map<string, CapabilityContract>();

    const settingWatchers = new Map<string, Set<(value: unknown) => void>>();
    const settingSubscriptionByKey = new Map<string, string>();

    const eventWatchers = new Map<string, Set<(payload: unknown) => void>>();
    const eventSubscriptionByName = new Map<string, string>();

    const disposeSubscriptionListener = rpcClient.on('capability.subscription', (payload) => {
        const data = asRecord(payload);
        const subscriptionId = data.subscriptionId;
        if (typeof subscriptionId !== 'string') return;

        for (const [key, id] of settingSubscriptionByKey.entries()) {
            if (id !== subscriptionId) continue;
            const watchers = settingWatchers.get(key);
            if (!watchers) return;
            for (const watcher of watchers) {
                try {
                    watcher(data.data);
                } catch (error) {
                    console.error('[plugin-view-sandbox] settings.onChange handler failed', error);
                }
            }
            return;
        }

        for (const [eventName, id] of eventSubscriptionByName.entries()) {
            if (id !== subscriptionId) continue;
            const watchers = eventWatchers.get(eventName);
            if (!watchers) return;
            for (const watcher of watchers) {
                try {
                    watcher(data.data);
                } catch (error) {
                    console.error('[plugin-view-sandbox] events.on handler failed', error);
                }
            }
            return;
        }
    });

    async function call<T = unknown>(method: string, paramsPayload?: unknown): Promise<T> {
        if (method === 'runtime.refreshExternalPlugins') {
            await rpcClient.call('refreshExternalPlugins');
            return null as T;
        }

        return rpcClient.call<T>('invokeHostMethod', {
            method,
            params: paramsPayload,
        });
    }

    async function ensureSettingSubscription(key: string): Promise<void> {
        if (settingSubscriptionByKey.has(key)) return;
        const subscriptionId = await call<string>('settings.subscribe', key);
        settingSubscriptionByKey.set(key, subscriptionId);
    }

    async function releaseSettingSubscriptionIfUnused(key: string): Promise<void> {
        const watchers = settingWatchers.get(key);
        if (watchers && watchers.size > 0) return;

        const subscriptionId = settingSubscriptionByKey.get(key);
        if (!subscriptionId) return;

        settingSubscriptionByKey.delete(key);
        await call('settings.unsubscribe', subscriptionId);
    }

    async function ensureEventSubscription(eventName: string): Promise<void> {
        if (eventSubscriptionByName.has(eventName)) return;
        const subscriptionId = await call<string>('events.subscribe', eventName);
        eventSubscriptionByName.set(eventName, subscriptionId);
    }

    async function releaseEventSubscriptionIfUnused(eventName: string): Promise<void> {
        const watchers = eventWatchers.get(eventName);
        if (watchers && watchers.size > 0) return;

        const subscriptionId = eventSubscriptionByName.get(eventName);
        if (!subscriptionId) return;

        eventSubscriptionByName.delete(eventName);
        await call('events.unsubscribe', subscriptionId);
    }

    function createDynamicCapabilityProxy(capabilityId: string): CapabilityContract {
        const existing = capabilityCache.get(capabilityId);
        if (existing) {
            return existing;
        }

        const proxy = new Proxy(
            {},
            {
                get: (_target, methodName) => {
                    if (typeof methodName !== 'string') return undefined;
                    return (...args: unknown[]) =>
                        call(
                            `${capabilityId}.${methodName}`,
                            args.length <= 1 ? args[0] : args
                        );
                },
            }
        ) as CapabilityContract;

        capabilityCache.set(capabilityId, proxy);
        return proxy;
    }

    const onWindowKeydown = (event: KeyboardEvent): void => {
        const payload: PluginViewLocalShortcutKeydownPayload = {
            code: event.code,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            repeat: event.repeat,
            isComposing: event.isComposing,
            defaultPrevented: event.defaultPrevented,
            targetIsEditable: isEditableTarget(event.target),
        };

        void rpcClient
            .call<boolean>('handleLocalShortcutKeydown', payload, 2_000)
            .then((handled) => {
                if (!handled) return;
                event.preventDefault();
                event.stopPropagation();
            })
            .catch(() => {
                // Ignore rpc errors while iframe/host reconnects.
            });
    };

    window.addEventListener('keydown', onWindowKeydown, true);
    const localCapabilityFactories: Record<string, () => CapabilityContract> = {
        settings: () => {
            const settings: SettingsCapability = {
                get: async function <T>(key: string): Promise<T | undefined> {
                    return call<T | undefined>('settings.get', key);
                },
                set: async (key: string, value: unknown): Promise<void> => {
                    await call('settings.set', { key, value });
                },
                onChange: function <T>(key: string, handler: (value: T | undefined) => void): PluginDisposable {
                    let watchers = settingWatchers.get(key);
                    if (!watchers) {
                        watchers = new Set();
                        settingWatchers.set(key, watchers);
                    }
                    const wrapped = (value: unknown) => handler(value as T | undefined);
                    watchers.add(wrapped);
                    void ensureSettingSubscription(key);

                    return {
                        dispose: () => {
                            watchers?.delete(wrapped);
                            if (watchers && watchers.size === 0) {
                                settingWatchers.delete(key);
                            }
                            void releaseSettingSubscriptionIfUnused(key);
                        },
                    };
                },
            };
            return settings as unknown as CapabilityContract;
        },
        events: () => {
            const events: EventsCapability = {
                emit: (eventName: string, payload?: unknown): void => {
                    void call('events.emit', { event: eventName, payload });
                },
                on: (eventName: string, handler: (payload: unknown) => void): PluginDisposable => {
                    let watchers = eventWatchers.get(eventName);
                    if (!watchers) {
                        watchers = new Set();
                        eventWatchers.set(eventName, watchers);
                    }
                    watchers.add(handler);
                    void ensureEventSubscription(eventName);

                    return {
                        dispose: () => {
                            watchers?.delete(handler);
                            if (watchers && watchers.size === 0) {
                                eventWatchers.delete(eventName);
                            }
                            void releaseEventSubscriptionIfUnused(eventName);
                        },
                    };
                },
            };
            return events as unknown as CapabilityContract;
        },
    };

    window.addEventListener(
        'beforeunload',
        () => {
            disposeSubscriptionListener();
            window.removeEventListener('keydown', onWindowKeydown, true);

            for (const subscriptionId of settingSubscriptionByKey.values()) {
                void call('settings.unsubscribe', subscriptionId);
            }
            for (const subscriptionId of eventSubscriptionByName.values()) {
                void call('events.unsubscribe', subscriptionId);
            }

            rpcClient.dispose();
            capabilityCache.clear();
            settingWatchers.clear();
            settingSubscriptionByKey.clear();
            eventWatchers.clear();
            eventSubscriptionByName.clear();
        },
        { once: true }
    );

    function getCapability<K extends string>(capabilityId: K): CapabilityById<K> {
        const cached = capabilityCache.get(capabilityId);
        if (cached) {
            return cached as CapabilityById<K>;
        }

        const createLocal = localCapabilityFactories[capabilityId];
        if (createLocal) {
            const localCapability = createLocal();
            capabilityCache.set(capabilityId, localCapability);
            return localCapability as CapabilityById<K>;
        }

        return createDynamicCapabilityProxy(capabilityId) as CapabilityById<K>;
    }

    return {
        get pluginId() {
            return params.pluginId;
        },
        call,
        get: getCapability,
    };
}

function App() {
    const [component, setComponent] = useState<ComponentType<Record<string, unknown>> | null>(null);
    const [params, setParams] = useState<SandboxParams>(() => parseParams());
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const nextParams = parseParams();
        setParams(nextParams);

        async function loadComponent(): Promise<void> {
            try {
                if (!nextParams.viewUrl) {
                    throw new Error(`Component not found: ${nextParams.viewId} (${nextParams.pluginId})`);
                }
                console.log('传入的视图url', nextParams)
                const loaded = await importPluginAssetByUrl(nextParams.viewUrl);
                if (!loaded.default) {
                    throw new Error(`Component default export missing: ${nextParams.viewId}`);
                }

                setError(null);
                setComponent(() => loaded.default as ComponentType<Record<string, unknown>>);
            } catch (loadError) {
                setError(String(loadError));
                setComponent(null);
            }
        }

        void loadComponent();
    }, []);

    if (error) {
        return <div style={{ padding: 12, color: '#b91c1c', fontSize: 12 }}>{error}</div>;
    }

    if (!component) {
        return <div style={{ padding: 12, color: '#64748b', fontSize: 12 }}>Loading plugin view...</div>;
    }

    const ViewComponent = component;
    return (
        <SandboxErrorBoundary viewId={params.viewId}>
            <ViewComponent {...params.props} />
        </SandboxErrorBoundary>
    );
}

function bootstrap(): void {
    const params = parseParams();
    window.React = React;

    const pluginApi = createSandboxPluginApi(params);
    window.__PLUG_BOX_API_FACTORY__ = async () => pluginApi;

    const root = document.getElementById('root');
    if (!root) {
        throw new Error('plugin sandbox root element not found');
    }

    ReactDOM.createRoot(root).render(<App />);
}

bootstrap();
