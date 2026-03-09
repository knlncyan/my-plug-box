import { useLayoutStore } from "@/store/useLayoutStore";
import { useCoreRuntime } from "@/core";
import { Ellipsis, LayoutGrid, Minus, PanelLeftClose, PanelLeftOpen, Search, Tags, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemHeader, ItemMedia, ItemTitle } from "@/components/ui/item";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default () => {
    const { loading, ready, error, plugins, commands, activeViewId, executeCommand, setActiveView } =
        useCoreRuntime();
    const [commandError, setCommandError] = useState<string | null>(null);
    const asideHidden = useLayoutStore(state => state.asideHidden);
    const toggleAside = useLayoutStore(state => state.toggleAside);
    const asideActivatedKey = useLayoutStore(state => state.asideActivatedKey);
    const asideActivateKey = useLayoutStore(state => state.asideActivateKey);
    const plugViewModel = useLayoutStore(state => state.plugViewModel);

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
                        <MoreOptions />
                        {asideHidden ? (
                            <button
                                onClick={() => { asideActivateKey('plugs'); toggleAside(); }}
                                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-black/10"
                            >
                                <PanelLeftOpen className="h-4 w-4 " />
                            </button>
                        ) : (
                            <button
                                onClick={() => { asideActivateKey('none'); toggleAside(); }}
                                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-black/10"
                            >
                                <PanelLeftClose className="h-4 w-4 " />
                            </button>
                        )}
                    </>}
            </div>
            {!asideHidden && (
                <>
                    <div className="flex-1 overflow-auto p-3">
                        {plugViewModel == 'list'
                            ? <ItemGroup className="gap-4">
                                {plugins.map((plugin) => (
                                    <Item key={plugin.id} variant="outline" asChild role="listitem">
                                        <a href="#" className="flex items-center gap-4 relative">
                                            <ItemMedia variant="image">
                                                <img
                                                    src={`public/vite.svg`}
                                                    alt={plugin.name}
                                                    width={32}
                                                    height={32}
                                                />
                                            </ItemMedia>
                                            <ItemContent className="flex-1 min-w-0">
                                                <ItemTitle className="block w-full line-clamp-1">
                                                    {plugin.name}
                                                </ItemTitle>
                                                <ItemDescription className="line-clamp-1">{plugin.description}</ItemDescription>
                                            </ItemContent>
                                            {/* 增加一个表示状态的小圆点 */}
                                            <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-green-500" />
                                        </a>
                                    </Item>
                                ))}
                            </ItemGroup>
                            : <ItemGroup className={`cursor-pointer grid ${plugViewModel == 'grid-medium' ? 'grid-cols-2' : 'grid-cols-3'} gap-3`}>
                                {plugins.map((plugin) => (
                                    <Item key={plugin.id} variant="muted" className="flex relative gap-1 hover:bg-neutral-100">
                                        <ItemHeader>
                                            <img
                                                src={`public/vite.svg`}
                                                alt={plugin.name}
                                                className={`${plugViewModel == 'grid-medium' && 'mx-3'} w-full`}
                                            />
                                        </ItemHeader>
                                        {plugViewModel == 'grid-medium' && <ItemContent className="flex-1 min-w-0">
                                            <ItemTitle className="block w-full text-xs text-center line-clamp-1">{plugin.name}</ItemTitle>
                                        </ItemContent>}
                                        <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-green-500" />
                                    </Item>
                                ))}
                            </ItemGroup>
                        }
                    </div>
                    <div className="flex-1 overflow-auto p-3">
                        {plugins.map((plugin) => {
                            const pluginView = plugin.view;
                            const pluginCommands = commandsByPlugin.get(plugin.id) ?? [];
                            return (
                                <section key={plugin.id} className="mb-4 rounded border border-neutral-200">
                                    <header className="border-b border-neutral-200 bg-neutral-100 px-3 py-2">
                                        <div className="text-sm font-medium">{plugin.name}</div>
                                        <div className="text-xs text-neutral-500">{plugin.status}</div>
                                    </header>

                                    <div className="border-b border-neutral-200 px-2 py-2">
                                        <p className="px-1 pb-1 text-[11px] uppercase tracking-wide text-neutral-500">Views</p>
                                        {!pluginView ? (
                                            <div className="px-1 py-1 text-xs text-neutral-500">No views</div>
                                        ) : (
                                            <div className="space-y-1">
                                                <button
                                                    onClick={() => selectView(pluginView.pluginId)}
                                                    className={`w-full rounded px-2 py-1.5 text-left text-sm transition ${activeViewId === pluginView?.id
                                                        ? 'bg-primary-700 text-white'
                                                        : 'text-neutral-700 hover:bg-neutral-100'
                                                        }`}
                                                >
                                                    {pluginView?.title}
                                                </button>


                                            </div>
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
                            {plugins.length} plugins, {commandCount} commands
                        </p>
                    </div>
                </>
            )}

        </div>
    )
}

const MoreOptions = () => {
    const viewModel = useLayoutStore(state => state.plugViewModel);
    const changeViewModel = useLayoutStore(state => state.changePlugViewModel);
    const asideHidden = useLayoutStore(state => state.asideHidden);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className='flex ml-auto h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-black/10 focus:outline-none' >
                    <Ellipsis className="h-4 w-4 " />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-40" side={`${asideHidden ? 'right' : 'bottom'}`} align={`${asideHidden ? 'center' : 'start'}`} sideOffset={asideHidden ? 10 : 4}>
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs text-neutral-500">Appearance</DropdownMenuLabel>

                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Grid View</DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                            <DropdownMenuSubContent>
                                <DropdownMenuCheckboxItem
                                    checked={viewModel == 'grid-small'}
                                    onCheckedChange={() => changeViewModel('grid-small')}
                                >
                                    Small
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem
                                    checked={viewModel == 'grid-medium'}
                                    onCheckedChange={() => changeViewModel('grid-medium')}
                                >
                                    Medium
                                </DropdownMenuCheckboxItem>
                                {/* <DropdownMenuSeparator />
                                <DropdownMenuItem>Webhook</DropdownMenuItem> */}
                            </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                    </DropdownMenuSub>
                    <DropdownMenuCheckboxItem
                        checked={viewModel == 'list'}
                        onCheckedChange={() => changeViewModel('list')}
                    >
                        List View
                    </DropdownMenuCheckboxItem>
                </DropdownMenuGroup>
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs text-neutral-500">Order</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem
                        checked={viewModel == 'list'}
                        onCheckedChange={() => changeViewModel('list')}
                    >
                        Activate First
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                        checked={viewModel == 'list'}
                        onCheckedChange={() => changeViewModel('list')}
                    >
                        Name First
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                        checked={viewModel == 'list'}
                        onCheckedChange={() => changeViewModel('list')}
                    >
                        Add Time First
                    </DropdownMenuCheckboxItem>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}