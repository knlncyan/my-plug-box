import { useLayoutStore } from "@/store/useLayoutStore";
import { useCoreRuntime } from "@/core";
import { Activity, Boxes, Ellipsis, LayoutGrid, PanelLeftClose, PanelLeftOpen, Search, Settings2, Tags, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemHeader, ItemMedia, ItemTitle } from "@/components/ui/item";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type AsideBarKeys = 'none' | 'plugs' | 'search' | 'tags'
type PlugViewModels = 'list' | 'grid-small' | 'grid-medium'
type PlugOrderKeys = 'name' | 'activate'

export default () => {
    const { plugins, activeViewPluginId, setActiveView } = useCoreRuntime();
    const [asideHidden, setAsideHidden] = useState<boolean>(false);
    const [hiddenBackend, setHiddenBackend] = useState<boolean>(false);
    const [asideBarKey, setAsideBarKey] = useState<AsideBarKeys>('plugs');
    const [plugViewModel, setPlugViewModel] = useState<PlugViewModels>('list');
    const [plugOrderKey, setPlugOrderKey] = useState<PlugOrderKeys>('activate');
    // const asideHidden = useLayoutStore(state => state.asideHidden);
    // const toggleAside = useLayoutStore(state => state.toggleAside);
    // const asideActivatedKey = useLayoutStore(state => state.asideActivatedKey);
    // const asideActivateKey = useLayoutStore(state => state.asideActivateKey);
    // const plugViewModel = useLayoutStore(state => state.plugViewModel);
    // const plugOrderKey = useLayoutStore(state => state.plugOrderKey);

    const selectViewPlugin = useCallback(
        (viewId: string) => {
            setActiveView(viewId);
        },
        [setActiveView]
    );

    const { activatedPlugins, handledPlugins } = useMemo(() => {
        const activatedPlugins = plugins.filter(it => it.status == 'Activated');
        const handledPlugins = hiddenBackend ? plugins.filter(it => !!it.view)
            : plugOrderKey == 'activate' ? plugins.sort((a, _) => (a.status == 'Activated' ? -1 : 1))
                : plugins.sort((a, b) => a.name.localeCompare(b.name));
        return { activatedPlugins, handledPlugins };
    }, [plugins, hiddenBackend, plugOrderKey]);

    // plugs被选中
    const handleAsideBarKey = (key: AsideBarKeys) => {
        setAsideBarKey(key);
        if (asideHidden) setAsideHidden(!asideHidden);
    }

    return (
        <div className={`flex flex-col ${asideHidden ? 'w-10' : 'w-[25%] max-w-75'} border-r border-neutral-200 bg-white`}>

            <div className={`flex ${asideHidden && 'flex-col'}  p-1`}>
                {asideBarKey == 'search'
                    ? <InputGroup className="h-8">
                        <InputGroupInput placeholder="Search..." autoFocus />
                        <InputGroupAddon>
                            <Search />
                        </InputGroupAddon>
                        <InputGroupAddon align="inline-end" >
                            <div
                                onClick={() => setAsideBarKey('plugs')}
                                className="flex h-8 w-8 pl-[-8px] cursor-pointer items-center justify-center"
                            >
                                <X className="h-4 w-4" />
                            </div>
                        </InputGroupAddon>
                    </InputGroup>
                    : <>
                        <button
                            onClick={() => handleAsideBarKey('plugs')}
                            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded ${asideBarKey == 'plugs' ? 'bg-primary-700  text-white' : 'hover:bg-black/10'}`}
                        >
                            <LayoutGrid className="h-4 w-4 " />
                        </button>
                        <button
                            onClick={() => handleAsideBarKey('search')}
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-black/10"
                        >
                            <Search className="h-4 w-4 " />
                        </button>
                        <button
                            onClick={() => handleAsideBarKey('tags')}
                            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded ${asideBarKey == 'tags' ? 'bg-primary-700  text-white' : 'hover:bg-black/10'}`}
                        >
                            <Tags className="h-4 w-4 " />
                        </button>
                        <MoreOptions asideHidden={asideHidden} plugViewModel={plugViewModel} setPlugViewModel={setPlugViewModel} plugOrderKey={plugOrderKey} setPlugOrderKey={setPlugOrderKey} hiddenBackend={hiddenBackend} setHiddenBackend={setHiddenBackend} />
                        {asideHidden ? (
                            <button
                                onClick={() => { setAsideBarKey('plugs'); setAsideHidden(!asideHidden); }}
                                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-black/10"
                            >
                                <PanelLeftOpen className="h-4 w-4 " />
                            </button>
                        ) : (
                            <button
                                onClick={() => { setAsideBarKey('none'); setAsideHidden(!asideHidden); }}
                                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-black/10"
                            >
                                <PanelLeftClose className="h-4 w-4 " />
                            </button>
                        )}
                    </>}
            </div>
            {!asideHidden
                ? (
                    <>
                        <div className="flex-1 overflow-auto p-3">
                            {plugViewModel == 'list'
                                ? <ItemGroup className="gap-4">
                                    {handledPlugins.map((plugin) => (
                                        <Item key={plugin.id} variant="outline" asChild role="listitem" onClick={() => selectViewPlugin(plugin.id)}>
                                            <div className={`flex items-center cursor-pointer gap-4 relative ${activeViewPluginId == plugin.id ? 'bg-neutral-700 text-white hover:bg-neutral-700!' : 'hover:bg-neutral-200!'}`}>
                                                <ItemMedia variant="image">
                                                    {plugin.icon ? (
                                                        <img
                                                            src={plugin.icon}
                                                            // src='/public/vite.svg'
                                                            alt={plugin.name}
                                                            width={32}
                                                            height={32}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <span className={`text-[20px] font-bold  ${activeViewPluginId == plugin.id ? 'text-white' : 'text-neutral-700'}`}>{plugin.name?.trim().charAt(0).toUpperCase()}</span>
                                                    )}
                                                </ItemMedia>
                                                <ItemContent className="flex-1 min-w-0">
                                                    <ItemTitle className="block w-full line-clamp-1">
                                                        {plugin.name}
                                                    </ItemTitle>
                                                    <ItemDescription className={`line-clamp-1 ${activeViewPluginId == plugin.id && 'text-neutral-300'}`}>{plugin.description}</ItemDescription>
                                                </ItemContent>
                                                {/* 增加一个表示状态的小圆点 */}
                                                <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-green-500" />
                                            </div>
                                        </Item>
                                    ))}
                                </ItemGroup>
                                : <ItemGroup className={`grid ${plugViewModel == 'grid-medium' ? 'grid-cols-2' : 'grid-cols-3'} gap-3`}>
                                    {handledPlugins.map((plugin) => (
                                        <Item
                                            key={plugin.id}
                                            variant="muted"
                                            // 1. 保持 aspect-square 确保整体是正方形
                                            // 2. 移除 flex gap-1 从根节点，改为在内部需要的地方加，避免影响正方形计算
                                            className={`relative cursor-pointer aspect-square p-2 ${activeViewPluginId == plugin.id ? 'bg-neutral-700 text-white' : 'hover:bg-neutral-200'}`}
                                            onClick={() => selectViewPlugin(plugin.id)}
                                        >
                                            {/* 内部容器：负责垂直排列图片和文字，并居中 */}
                                            <div className="flex flex-col items-center justify-center w-full h-full gap-1">
                                                {/* 图标/首字母区域：固定宽度或最大宽度，确保在不同模式下占据空间一致 */}
                                                <div className="flex items-center justify-center w-full">
                                                    {plugin.icon ? (
                                                        <img
                                                            src={plugin.icon}
                                                            alt={plugin.name}
                                                            className={`max-w-[80%] max-h-[80%] w-auto h-auto object-contain ${plugViewModel !== 'grid-medium' ? 'max-w-[60%] max-h-[60%]' : ''}`}
                                                        />
                                                    ) : (
                                                        <span className={`text-2xl font-bold leading-none ${activeViewPluginId == plugin.id ? 'text-white' : 'text-neutral-700'}`}>
                                                            {plugin.name?.trim().charAt(0).toUpperCase()}
                                                        </span>
                                                    )}
                                                </div>
                                                {/* 文字区域：仅在 grid-medium 显示 */}
                                                {plugViewModel == 'grid-medium' && (
                                                    <ItemTitle className="block w-full text-xs text-center line-clamp-1 font-medium">
                                                        {plugin.name}
                                                    </ItemTitle>
                                                )}
                                            </div>
                                            {/* 状态点：位置保持不变 */}
                                            <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-green-500" />
                                        </Item>
                                    ))}
                                </ItemGroup>
                            }
                        </div>
                        <div className="flex p-1 items-center gap-1.5  text-xs text-neutral-500 border-t border-neutral-150">
                            <Boxes className="w-4 h-4" /><span>{plugins.length}</span>
                            <Activity className="w-4 h-4" /><span>{activatedPlugins.length}</span>
                            <button className='flex ml-auto h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-black/10' >
                                <Settings2 className="h-4 w-4 " />
                            </button>
                        </div>
                    </>
                )
                : <>
                    <div className='p-1 w-10 h-full overflow-y-auto [&::-webkit-scrollbar]:hidden scrollbar-width-0'>
                        {handledPlugins.map((plugin) => (
                            <div
                                key={plugin.id}
                                className={`flex items-center justify-center relative cursor-pointer mb-1 w-8 h-8 rounded ${activeViewPluginId == plugin.id ? 'bg-neutral-700 text-white' : 'hover:bg-neutral-200'}`}
                                onClick={() => selectViewPlugin(plugin.id)}
                            >
                                {plugin.icon ? (
                                    <img
                                        src={plugin.icon}
                                        alt={plugin.name}
                                        className='w-6 h-6 object-contain'
                                    />
                                ) : (
                                    <span className={`text-xl font-bold leading-none ${activeViewPluginId == plugin.id ? 'text-white' : 'text-neutral-700'}`}>
                                        {plugin.name?.trim().charAt(0).toUpperCase()}
                                    </span>
                                )}
                                <div className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-green-500" />
                            </div>

                        ))}
                    </div>
                    <div className='flex w-10 h-10 items-center justify-center my-1'>
                        <button className='flex w-8 h-8  cursor-pointer items-center justify-center rounded hover:bg-black/10' >
                            <Settings2 className="h-4 w-4 " />
                        </button>
                    </div>

                </>


            }

        </div >
    )
}

interface MoreOptionsProps {
    asideHidden: boolean;
    hiddenBackend: boolean;
    setHiddenBackend: (val: boolean) => void;
    plugViewModel: PlugViewModels;
    setPlugViewModel: (val: PlugViewModels) => void;
    plugOrderKey: PlugOrderKeys;
    setPlugOrderKey: (val: PlugOrderKeys) => void;
}

const MoreOptions = (props: MoreOptionsProps) => {
    const { asideHidden, plugViewModel, setPlugViewModel, plugOrderKey, setPlugOrderKey, hiddenBackend, setHiddenBackend } = props;

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
                                    checked={plugViewModel == 'grid-small'}
                                    onCheckedChange={() => setPlugViewModel('grid-small')}
                                >
                                    Small
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem
                                    checked={plugViewModel == 'grid-medium'}
                                    onCheckedChange={() => setPlugViewModel('grid-medium')}
                                >
                                    Medium
                                </DropdownMenuCheckboxItem>
                                {/* <DropdownMenuSeparator />
                                <DropdownMenuItem>Webhook</DropdownMenuItem> */}
                            </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                    </DropdownMenuSub>
                    <DropdownMenuCheckboxItem
                        checked={plugViewModel == 'list'}
                        onCheckedChange={() => setPlugViewModel('list')}
                    >
                        List View
                    </DropdownMenuCheckboxItem>
                </DropdownMenuGroup>
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs text-neutral-500">Order</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem
                        checked={plugOrderKey == 'activate'}
                        onCheckedChange={() => setPlugOrderKey('activate')}
                    >
                        Activate First
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                        checked={plugOrderKey == 'name'}
                        onCheckedChange={() => setPlugOrderKey('name')}
                    >
                        Name First
                    </DropdownMenuCheckboxItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                    checked={hiddenBackend}
                    onCheckedChange={() => setHiddenBackend(!hiddenBackend)}
                >
                    Hiden Backend Plugs
                </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}