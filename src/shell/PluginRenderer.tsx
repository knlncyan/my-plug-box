/**
 * Plugin view renderer with per-plugin error isolation.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { ViewMeta } from '../core/plugin-protocol';
import { resolveBuiltinViewComponent } from '../plugins';

interface Props {
  view: ViewMeta;
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

export function PluginViewLoader({ view }: Props) {
  const Component = resolveBuiltinViewComponent(view.component_path);

  if (!Component) {
    return (
      <div className="p-4 text-sm text-red-600">
        Failed to resolve component: {view.component_path}
      </div>
    );
  }

  return (
    <PluginViewErrorBoundary pluginId={view.plugin_id} viewId={view.id}>
      <Component {...view.props} />
    </PluginViewErrorBoundary>
  );
}
