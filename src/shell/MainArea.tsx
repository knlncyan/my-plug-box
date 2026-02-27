import { useEffect, useState } from 'react';
import type { ViewRegistry } from '../core/view-registry';
import type { EventBus } from '../core/event-bus';
import { PluginViewHost } from './PluginViewHost';

interface Props {
  viewRegistry: ViewRegistry;
  eventBus: EventBus;
}

export function MainArea({ viewRegistry, eventBus }: Props) {
  const views = viewRegistry.getByLocation('main');
  const [activeId, setActiveId] = useState<string | null>(null);

  const effectiveId = activeId ?? (views[0]?.id ?? null);

  // Allow plugins to focus a view programmatically via events
  useEffect(() => {
    const d = eventBus.on('view.focus', (data) => {
      const payload = data as { viewId?: string };
      if (payload?.viewId) setActiveId(payload.viewId);
    });
    return () => d.dispose();
  }, [eventBus]);

  if (views.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 select-none">
        <p className="text-sm">No views registered — install a plugin to get started.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
      {/* Tab bar */}
      <div className="flex h-9 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 overflow-x-auto flex-shrink-0">
        {views.map((view) => (
          <button
            key={view.id}
            onClick={() => setActiveId(view.id)}
            className={`px-4 py-1.5 text-sm whitespace-nowrap border-r border-gray-200 dark:border-gray-700 transition-colors select-none ${
              view.id === effectiveId
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-t-2 border-t-purple-500 -mt-px'
                : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            {view.name}
          </button>
        ))}
      </div>

      {/* Active view content */}
      <div className="flex-1 overflow-auto">
        {effectiveId && (() => {
          const view = viewRegistry.getById(effectiveId);
          return view ? <PluginViewHost view={view} /> : null;
        })()}
      </div>
    </div>
  );
}
