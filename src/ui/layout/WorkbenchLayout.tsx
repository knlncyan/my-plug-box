/**
 * Main workbench layout that displays plugin views and command launchers.
 */
import { useCallback, useMemo, useState } from 'react';
import { useCoreRuntime } from '../../core';
import { PluginViewLoader } from '../plugin/PluginRenderer';

export default function WorkbenchLayout() {
    const { loading, ready, error, views, plugins, commands, activeViewId, executeCommand, setActiveView } =
        useCoreRuntime();
    const [commandError, setCommandError] = useState<string | null>(null);

    const selectView = useCallback(
        (viewId: string) => {
            setActiveView(viewId);
        },
        [setActiveView]
    );

    const runCommand = useCallback(
        async (commandId: string) => {
            try {
                setCommandError(null);
                await executeCommand(commandId);
            } catch (runError) {
                setCommandError(String(runError));
            }
        },
        [executeCommand]
    );

    const activeView = useMemo(
        () => views.find((view) => view.id === activeViewId) ?? null,
        [views, activeViewId]
    );

    const viewsByPlugin = useMemo(() => {
        const bucket = new Map<string, typeof views>();
        for (const view of views) {
            const list = bucket.get(view.plugin_id);
            if (list) {
                list.push(view);
            } else {
                bucket.set(view.plugin_id, [view]);
            }
        }
        return bucket;
    }, [views]);

    const commandsByPlugin = useMemo(() => {
        const bucket = new Map<string, typeof commands>();
        for (const command of commands) {
            const list = bucket.get(command.plugin_id);
            if (list) {
                list.push(command);
            } else {
                bucket.set(command.plugin_id, [command]);
            }
        }
        return bucket;
    }, [commands]);

    const commandCount = commands.length;

    return (
        <div className="flex h-screen bg-slate-50 text-slate-900">
            <aside className="w-80 border-r border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3">
                    <h1 className="text-sm font-semibold tracking-wide">Plug Box Workbench</h1>
                    <p className="mt-1 text-xs text-slate-500">
                        {plugins.length} plugins, {views.length} views, {commandCount} commands
                    </p>
                </div>

                <div className="h-[calc(100vh-57px)] overflow-auto p-3">
                    {plugins.map((plugin) => {
                        const pluginViews = viewsByPlugin.get(plugin.id) ?? [];
                        const pluginCommands = commandsByPlugin.get(plugin.id) ?? [];
                        return (
                            <section key={plugin.id} className="mb-4 rounded border border-slate-200">
                                <header className="border-b border-slate-200 bg-slate-100 px-3 py-2">
                                    <div className="text-sm font-medium">{plugin.name}</div>
                                    <div className="text-xs text-slate-500">{plugin.status}</div>
                                </header>

                                <div className="border-b border-slate-200 px-2 py-2">
                                    <p className="px-1 pb-1 text-[11px] uppercase tracking-wide text-slate-500">Views</p>
                                    {pluginViews.length === 0 ? (
                                        <div className="px-1 py-1 text-xs text-slate-500">No views</div>
                                    ) : (
                                        <ul className="space-y-1">
                                            {pluginViews.map((view) => (
                                                <li key={view.id}>
                                                    <button
                                                        onClick={() => selectView(view.id)}
                                                        className={`w-full rounded px-2 py-1.5 text-left text-sm transition ${activeViewId === view.id
                                                                ? 'bg-slate-900 text-white'
                                                                : 'text-slate-700 hover:bg-slate-100'
                                                            }`}
                                                    >
                                                        {view.title}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                <div className="px-2 py-2">
                                    <p className="px-1 pb-1 text-[11px] uppercase tracking-wide text-slate-500">Commands</p>
                                    {pluginCommands.length === 0 ? (
                                        <div className="px-1 py-1 text-xs text-slate-500">No commands</div>
                                    ) : (
                                        <ul className="space-y-1">
                                            {pluginCommands.map((command) => (
                                                <li key={command.id}>
                                                    <button
                                                        onClick={() => void runCommand(command.id)}
                                                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-left text-xs text-slate-700 transition hover:bg-slate-100"
                                                    >
                                                        {command.description || command.id}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>
            </aside>

            <main className="flex-1 overflow-auto">
                {loading && !ready ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading plugins...</div>
                ) : activeView ? (
                    <PluginViewLoader view={activeView} />
                ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                        No view is available.
                    </div>
                )}

                {error ? (
                    <div className="fixed bottom-4 right-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                        Runtime error: {error}
                    </div>
                ) : null}

                {commandError ? (
                    <div className="fixed bottom-16 right-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        Command error: {commandError}
                    </div>
                ) : null}
            </main>
        </div>
    );
}
