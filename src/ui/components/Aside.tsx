import { useLayoutStore } from "@/store/useLayoutStore";
import { useCoreRuntime } from "@/core";
import { LayoutGrid, Minus, PanelLeftClose, PanelLeftOpen, Search, Tags, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

export default () => {
    const { loading, ready, error, views, plugins, commands, activeViewId, executeCommand, setActiveView } =
        useCoreRuntime();
    const [commandError, setCommandError] = useState<string | null>(null);
    const asideHidden = useLayoutStore(state => state.asideHidden);
    const toggleAside = useLayoutStore(state => state.toggleAside);
    const asideActivatedKey = useLayoutStore(state => state.asideActivatedKey);
    const asideActivateKey = useLayoutStore(state => state.asideActivateKey);

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

    // plugs被选中
    const handlePlugsSelected = () => {
        asideActivateKey('plugs');
        if (asideHidden) toggleAside();
    }

    // search被选中
    const handleSearchSelected = () => {
        asideActivateKey('search');
        if (asideHidden) toggleAside();
    }

    // tags被选中
    const handleTagsSelected = () => {
        asideActivateKey('tags');
        if (asideHidden) toggleAside();
    }

    return (
        <div className={`flex flex-col ${asideHidden ? 'w-10' : 'w-[25%] max-w-75'} border-r border-neutral-200 bg-white`}>

            <div className={`flex ${asideHidden && 'flex-col'}  p-1`}>
                {asideActivatedKey == 'search'
                    ? <>
                        <InputGroup className="h-8">
                            <InputGroupInput placeholder="Search..." autoFocus />
                            <InputGroupAddon>
                                <Search />
                            </InputGroupAddon>
                            <InputGroupAddon align="inline-end" >
                                <div
                                    onClick={() => asideActivateKey('plugs')}
                                    className="flex h-8 w-8 pl-[-8px] cursor-pointer items-center justify-center"
                                >
                                    <X className="h-4 w-4" />
                                </div>

                            </InputGroupAddon>
                        </InputGroup>
                    </>
                    : <>
                        <button
                            onClick={handlePlugsSelected}
                            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded ${asideActivatedKey == 'plugs' ? 'bg-primary-700  text-white' : 'hover:bg-black/10'}`}
                        >
                            <LayoutGrid className="h-4 w-4 " />
                        </button>
                        <button
                            onClick={handleSearchSelected}
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-black/10"
                        >
                            <Search className="h-4 w-4 " />
                        </button>
                        <button
                            onClick={handleTagsSelected}
                            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded ${asideActivatedKey == 'tags' ? 'bg-primary-700  text-white' : 'hover:bg-black/10'}`}
                        >
                            <Tags className="h-4 w-4 " />
                        </button>
                        {asideHidden ? (
                            <button
                                onClick={() => { asideActivateKey('plugs'); toggleAside(); }}
                                className="flex ml-auto h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-black/10"
                            >
                                <PanelLeftOpen className="h-4 w-4 " />
                            </button>
                        ) : (
                            <button
                                onClick={() => { asideActivateKey('none'); toggleAside(); }}
                                className="flex ml-auto h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-black/10"
                            >
                                <PanelLeftClose className="h-4 w-4 " />
                            </button>
                        )}
                    </>}
            </div>
            {!asideHidden && (
                <>

                    <div className="flex-1 overflow-auto p-3">
                        {plugins.map((plugin) => {
                            const pluginViews = viewsByPlugin.get(plugin.id) ?? [];
                            const pluginCommands = commandsByPlugin.get(plugin.id) ?? [];
                            return (
                                <section key={plugin.id} className="mb-4 rounded border border-neutral-200">
                                    <header className="border-b border-neutral-200 bg-neutral-100 px-3 py-2">
                                        <div className="text-sm font-medium">{plugin.name}</div>
                                        <div className="text-xs text-neutral-500">{plugin.status}</div>
                                    </header>

                                    <div className="border-b border-neutral-200 px-2 py-2">
                                        <p className="px-1 pb-1 text-[11px] uppercase tracking-wide text-neutral-500">Views</p>
                                        {pluginViews.length === 0 ? (
                                            <div className="px-1 py-1 text-xs text-neutral-500">No views</div>
                                        ) : (
                                            <ul className="space-y-1">
                                                {pluginViews.map((view) => (
                                                    <li key={view.id}>
                                                        <button
                                                            onClick={() => selectView(view.id)}
                                                            className={`w-full rounded px-2 py-1.5 text-left text-sm transition ${activeViewId === view.id
                                                                ? 'bg-primary-700 text-white'
                                                                : 'text-neutral-700 hover:bg-neutral-100'
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
                                        <p className="px-1 pb-1 text-[11px] uppercase tracking-wide text-neutral-500">
                                            Commands
                                        </p>
                                        {pluginCommands.length === 0 ? (
                                            <div className="px-1 py-1 text-xs text-neutral-500">No commands</div>
                                        ) : (
                                            <ul className="space-y-1">
                                                {pluginCommands.map((command) => (
                                                    <li key={command.id}>
                                                        <button
                                                            onClick={() => void runCommand(command.id)}
                                                            className="w-full rounded border border-neutral-200 px-2 py-1.5 text-left text-xs text-neutral-700 transition hover:bg-neutral-100"
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
                    <div className="flex p-1 border-t border-neutral-150">
                        <p className="mt-1 text-xs text-neutral-500">
                            {plugins.length} plugins, {views.length} views, {commandCount} commands
                        </p>
                    </div>
                </>
            )}

        </div>
    )
}