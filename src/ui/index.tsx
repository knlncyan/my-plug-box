/**
 * Main workbench layout that displays plugin views and command launchers.
 */
import { useCallback, useMemo, useState } from 'react';
import { useCoreRuntime } from '../core';
import { PluginViewLoader } from '../core/PluginRenderer';
import TopBar from '@/ui/components/TopBar';
import Aside from './components/Aside';

export default function WorkbenchLayout() {
    const { loading, ready, error, plugins, commands, activeViewId, executeCommand, setActiveView } =
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
        () => plugins.find((plugin) => plugin.view?.id === activeViewId)?.view ?? null,
        [plugins, activeViewId]
    );

    // const viewsByPlugin = useMemo(() => {
    //     const bucket = new Map<string, typeof views>();
    //     for (const view of views) {
    //         const list = bucket.get(view.plugin_id);
    //         if (list) {
    //             list.push(view);
    //         } else {
    //             bucket.set(view.plugin_id, [view]);
    //         }
    //     }
    //     return bucket;
    // }, [views]);

    const commandsByPlugin = useMemo(() => {
        const bucket = new Map<string, typeof commands>();
        for (const command of commands) {
            const list = bucket.get(command.pluginId);
            if (list) {
                list.push(command);
            } else {
                bucket.set(command.pluginId, [command]);
            }
        }
        return bucket;
    }, [commands]);

    const commandCount = commands.length;

    return (
        <div className="flex h-screen flex-col bg-neutral-50 text-neutral-900">
            <TopBar />

            <div className="flex flex-1 min-h-0 overflow-hidden">
                <Aside />

                <main className="flex-1 overflow-auto">
                    {loading && !ready ? (
                        <div className="flex h-full items-center justify-center text-sm text-neutral-500">Loading plugins...</div>
                    ) : activeView ? (
                        <PluginViewLoader view={activeView} />
                    ) : (
                        <div className="flex h-full items-center justify-center text-sm text-neutral-500">
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
        </div>
    );
}
