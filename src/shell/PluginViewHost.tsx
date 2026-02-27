import type { RegisteredView } from '../core/types';

interface Props {
  view: RegisteredView;
}

/**
 * Renders a plugin view — either a React component (built-in plugin)
 * or an iframe (external plugin).
 */
export function PluginViewHost({ view }: Props) {
  if (view.component) {
    const Component = view.component;
    return (
      <div className="w-full h-full">
        <Component />
      </div>
    );
  }

  if (view.iframeUrl) {
    return (
      <iframe
        src={view.iframeUrl}
        className="w-full h-full border-none"
        sandbox="allow-scripts allow-same-origin"
        title={view.name}
      />
    );
  }

  return (
    <div className="p-4 text-gray-400 text-sm">
      View &quot;{view.id}&quot; has no component or iframe URL registered.
    </div>
  );
}
