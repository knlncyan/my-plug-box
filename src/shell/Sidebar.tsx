import { useState } from 'react';
import type { ViewRegistry } from '../core/view-registry';
import { PluginViewHost } from './PluginViewHost';

interface Props {
  viewRegistry: ViewRegistry;
}

export function Sidebar({ viewRegistry }: Props) {
  const views = viewRegistry.getByLocation('sidebar');
  const [activeId, setActiveId] = useState<string | null>(null);

  const effectiveId = activeId ?? (views[0]?.id ?? null);

  return (
    <div className="flex h-full flex-shrink-0">
      {/* Activity bar — icon buttons */}
      <div className="w-12 bg-gray-900 border-r border-gray-700 flex flex-col items-center py-2 gap-1">
        {views.map((view) => (
          <button
            key={view.id}
            title={view.name}
            onClick={() => setActiveId(view.id === effectiveId ? null : view.id)}
            className={`w-9 h-9 rounded flex items-center justify-center text-xs font-bold transition-colors select-none ${
              view.id === effectiveId
                ? 'bg-gray-600 text-white'
                : 'text-gray-500 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            {view.icon ?? view.name.charAt(0).toUpperCase()}
          </button>
        ))}
      </div>

      {/* Side panel — rendered only when a view is active */}
      {effectiveId && views.length > 0 && (
        <div className="w-56 bg-gray-800 border-r border-gray-700 flex flex-col overflow-hidden">
          {/* Panel header */}
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-700 flex-shrink-0">
            {views.find((v) => v.id === effectiveId)?.name}
          </div>
          {/* Panel content */}
          <div className="flex-1 overflow-auto">
            {(() => {
              const view = viewRegistry.getById(effectiveId);
              return view ? <PluginViewHost view={view} /> : null;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
