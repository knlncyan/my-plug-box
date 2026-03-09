/**
 * 主界面渲染，采用沙箱隔离
 */
import { Component, type ComponentType, type ErrorInfo, type ReactNode, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../../index.css';
import { getPluginViewLoaderById, resolvePluginViewModuleKey } from '../utils/pluginResourceLoader';

declare global {
    interface Window {
        __PLUGIN_VIEW_SANDBOX__?: boolean;
    }
}

interface SandboxParams {
    viewId: string;
    pluginId: string;
    // componentPath: string;
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
    // const componentPath = params.get('componentPath') ?? '';
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

    return { viewId, pluginId, props };
}

function App() {
    const [component, setComponent] = useState<ComponentType<Record<string, unknown>> | null>(null);
    const [params, setParams] = useState<SandboxParams>(() => parseParams());
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const nextParams = parseParams();
        setParams(nextParams);

        async function loadComponent(): Promise<void> {
            const moduleKey = resolvePluginViewModuleKey(nextParams.pluginId);
            const loader = getPluginViewLoaderById(nextParams.pluginId);

            if (!loader) {
                setError(`Component not found: ${nextParams.viewId} (${moduleKey})`);
                setComponent(null);
                return;
            }

            try {
                const loaded = await loader();
                if (!loaded.default) {
                    setError(`Component default export missing: ${nextParams.viewId}`);
                    setComponent(null);
                    return;
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
    // 标记当前窗口为插件视图沙箱环境，供 useCoreRuntime 切换桥接模式。
    window.__PLUGIN_VIEW_SANDBOX__ = true;

    const root = document.getElementById('root');
    if (!root) {
        throw new Error('plugin sandbox root element not found');
    }

    ReactDOM.createRoot(root).render(<App />);
}

bootstrap();
