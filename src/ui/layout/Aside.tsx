import { useCoreRuntime } from "@/core";
import { Activity, Boxes, Ellipsis, LayoutGrid, PanelLeftClose, PanelLeftOpen, Search, Settings2, Tags, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAppViewStore } from "@/store/appViewStore";
import { AsideBarKeys, useAsideStateStore } from "@/store/asideStateStore";
import { useCommandPaletteDialog } from "../pages/commandPalette";
import PluginManager from "../pages/pluginManager";
import { MyTooltip } from "@/components/MyTooltip";

export default () => {
    const { plugins, activeViewPluginId, setActiveView } = useCoreRuntime();
    // 侧边栏隐藏
    const hiddenAside = useAsideStateStore(it => it.hiddenAside);
    const toggleAside = useAsideStateStore(it => it.toggleAside);
    // 隐藏后台插件（无视图插件）
    const hiddenBackend = useAsideStateStore(it => it.hiddenBackend);
    // 选中的功能键
    const asideBarKey = useAsideStateStore(it => it.asideBarKey);
    const changeAsideBarKey = useAsideStateStore(it => it.changeAsideBarKey);
    // 插件展示模式
    const plugViewMode = useAsideStateStore(it => it.plugViewMode);
    // 插件排序模式
    const plugOrderKey = useAsideStateStore(it => it.plugOrderKey);
    // 插件搜索
    const [search, setSearch] = useState<string>('');
    const setMainViewContent = useAppViewStore(state => state.setMainViewContent);

    const selectViewPlugin = useCallback(
        (viewId: string) => {
            setActiveView(viewId);
        },
        [setActiveView]
    );

    const { activatedPlugins, handledPlugins } = useMemo(() => {
        const activatedPlugins = plugins.filter(it => it.status == 'Activated');
        // 过滤
        const filteredPlugins = plugins.filter(it => {
            return (!hiddenBackend || it.view) && (it.name.includes(search) || it.description?.includes(search))
        });
        // 排序
        const handledPlugins = plugOrderKey == 'activate'
            ? filteredPlugins.sort((a, _) => (a.status == 'Activated' ? -1 : 1))
            : filteredPlugins.sort((a, b) => a.name.localeCompare(b.name));
        return { activatedPlugins, handledPlugins };
    }, [plugins, hiddenBackend, plugOrderKey, search]);

    // 功能键被选中
    const handleAsideBarKey = (key: AsideBarKeys) => {
        changeAsideBarKey(key);
        if (hiddenAside) toggleAside();
    }
    // 取消搜索
    const cancelSearch = () => {
        changeAsideBarKey('plugs');
        setSearch('');
    }
    // 插件被选中
    const handlePlugSelect = (pluginId: string) => {
        selectViewPlugin(pluginId);
        setMainViewContent(null);
    }

    return (
        <div className={`flex flex-col ${hiddenAside ? 'w-10' : 'w-[25%] max-w-75'} border-r border-neutral-200 bg-white`}>
            <div className={`flex ${hiddenAside && 'flex-col'}  p-1`}>
                {asideBarKey == 'search'
                    ? <InputGroup className="h-8">
                        <InputGroupInput placeholder="Search..." autoFocus value={search} onChange={e => setSearch(e.target.value)} />
                        <InputGroupAddon>
                            <Search />
                        </InputGroupAddon>
                        <InputGroupAddon align="inline-end" >
                            <div
                                onClick={cancelSearch}
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
                        <MoreOptions />
                        {hiddenAside ? (
                            <button
                                onClick={() => { changeAsideBarKey('plugs'); toggleAside(); }}
                                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-black/10"
                            >
                                <PanelLeftOpen className="h-4 w-4 " />
                            </button>
                        ) : (
                            <button
                                onClick={() => { changeAsideBarKey('none'); toggleAside(); }}
                                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-black/10"
                            >
                                <PanelLeftClose className="h-4 w-4 " />
                            </button>
                        )}
                    </>}
            </div>
            {!hiddenAside
                ? (
                    <>
                        <div className="flex-1 overflow-auto p-3">
                            {plugViewMode == 'list'
                                ? <ItemGroup className="gap-4">
                                    {handledPlugins.map((plugin) => (
                                        <Item key={plugin.id} variant="outline" asChild role="listitem" onClick={() => handlePlugSelect(plugin.id)}>
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
                                : <ItemGroup className={`grid ${plugViewMode == 'grid-medium' ? 'grid-cols-2' : 'grid-cols-3'} gap-3`}>
                                    {handledPlugins.map((plugin) => (
                                        <Item
                                            key={plugin.id}
                                            variant="muted"
                                            // 1. 保持 aspect-square 确保整体是正方形
                                            // 2. 移除 flex gap-1 从根节点，改为在内部需要的地方加，避免影响正方形计算
                                            className={`relative cursor-pointer aspect-square p-2 ${activeViewPluginId == plugin.id ? 'bg-neutral-700 text-white' : 'hover:bg-neutral-200'}`}
                                            onClick={() => handlePlugSelect(plugin.id)}
                                        >
                                            {/* 内部容器：负责垂直排列图片和文字，并居中 */}
                                            <div className="flex flex-col items-center justify-center w-full h-full gap-1">
                                                {/* 图标/首字母区域：固定宽度或最大宽度，确保在不同模式下占据空间一致 */}
                                                <div className="flex items-center justify-center w-full">
                                                    {plugin.icon ? (
                                                        <img
                                                            src={plugin.icon}
                                                            alt={plugin.name}
                                                            className={`max-w-[80%] max-h-[80%] w-auto h-auto object-contain ${plugViewMode !== 'grid-medium' ? 'max-w-[60%] max-h-[60%]' : ''}`}
                                                        />
                                                    ) : (
                                                        <span className={`text-2xl font-bold leading-none ${activeViewPluginId == plugin.id ? 'text-white' : 'text-neutral-700'}`}>
                                                            {plugin.name?.trim().charAt(0).toUpperCase()}
                                                        </span>
                                                    )}
                                                </div>
                                                {/* 文字区域：仅在 grid-medium 显示 */}
                                                {plugViewMode == 'grid-medium' && (
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
                            <MyTooltip text="插件数量">
                                <div className="flex items-center gap-1.5"><Boxes className="w-4 h-4" /><span>{plugins.length}</span></div>
                            </MyTooltip>
                            <MyTooltip text="已激活插件数量">
                                <div className="flex items-center gap-1.5"><Activity className="w-4 h-4" /><span>{activatedPlugins.length}</span></div>
                            </MyTooltip>
                            <SettingCenter />
                        </div>
                    </>
                )
                : <>
                    <div className='p-1 w-10 h-full overflow-y-auto [&::-webkit-scrollbar]:hidden scrollbar-width-0'>
                        {handledPlugins.map((plugin) => (
                            <div
                                key={plugin.id}
                                className={`flex items-center justify-center relative cursor-pointer mb-1 w-8 h-8 rounded ${activeViewPluginId == plugin.id ? 'bg-neutral-700 text-white' : 'hover:bg-neutral-200'}`}
                                onClick={() => handlePlugSelect(plugin.id)}
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
                    <SettingCenter />
                </>
            }
        </div >
    )
}

const MoreOptions = () => {
    // 侧边栏隐藏
    const hiddenAside = useAsideStateStore(it => it.hiddenAside);
    // 隐藏后台插件（无视图插件）
    const hiddenBackend = useAsideStateStore(it => it.hiddenBackend);
    const changeHiddenBackend = useAsideStateStore(it => it.changeHiddenBackend);
    // 插件展示模式
    const plugViewMode = useAsideStateStore(it => it.plugViewMode);
    const changePlugViewMode = useAsideStateStore(it => it.changePlugViewMode);
    // 插件排序模式
    const plugOrderKey = useAsideStateStore(it => it.plugOrderKey);
    const changePlugOrderKey = useAsideStateStore(it => it.changePlugOrderKey);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className='flex ml-auto h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-black/10 focus:outline-none' >
                    <Ellipsis className="h-4 w-4 " />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-40" side={`${hiddenAside ? 'right' : 'bottom'}`} align={`${hiddenAside ? 'center' : 'start'}`} sideOffset={hiddenAside ? 10 : 4}>
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs text-neutral-500">Appearance</DropdownMenuLabel>
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="cursor-pointer">Grid View</DropdownMenuSubTrigger>
                        <DropdownMenuPortal >
                            <DropdownMenuSubContent>
                                <DropdownMenuCheckboxItem
                                    className="cursor-pointer"
                                    checked={plugViewMode == 'grid-small'}
                                    onCheckedChange={() => changePlugViewMode('grid-small')}
                                >
                                    Small
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem
                                    className="cursor-pointer"
                                    checked={plugViewMode == 'grid-medium'}
                                    onCheckedChange={() => changePlugViewMode('grid-medium')}
                                >
                                    Medium
                                </DropdownMenuCheckboxItem>
                            </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                    </DropdownMenuSub>
                    <DropdownMenuCheckboxItem
                        className="cursor-pointer"
                        checked={plugViewMode == 'list'}
                        onCheckedChange={() => changePlugViewMode('list')}
                    >
                        List View
                    </DropdownMenuCheckboxItem>
                </DropdownMenuGroup>
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs text-neutral-500">Order</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem
                        className="cursor-pointer"
                        checked={plugOrderKey == 'activate'}
                        onCheckedChange={() => changePlugOrderKey('activate')}
                    >
                        Activate First
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                        className="cursor-pointer"
                        checked={plugOrderKey == 'name'}
                        onCheckedChange={() => changePlugOrderKey('name')}
                    >
                        Name First
                    </DropdownMenuCheckboxItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                    className="cursor-pointer"
                    checked={hiddenBackend}
                    onCheckedChange={() => changeHiddenBackend()}
                >
                    Hiden Backend Plugs
                </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

const SettingCenter = () => {
    const hiddenAside = useAsideStateStore(it => it.hiddenAside);
    const setMainViewContent = useAppViewStore(state => state.setMainViewContent);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                {hiddenAside
                    ? <div className='flex ml-auto w-10 h-10 items-center justify-center my-1'>
                        <button className='flex  w-8 h-8 cursor-pointer items-center justify-center rounded hover:bg-black/10' >
                            <Settings2 className="h-4 w-4 " />
                        </button>
                    </div>
                    : <button className='flex ml-auto w-8 h-8 cursor-pointer items-center justify-center rounded hover:bg-black/10' >
                        <Settings2 className="h-4 w-4 " />
                    </button>
                }
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-40" side={`${hiddenAside ? 'right' : 'top'}`} align={`${hiddenAside ? 'end' : 'center'}`} sideOffset={hiddenAside ? 10 : 4}>
                <DropdownMenuItem className="cursor-pointer" onSelect={() => useCommandPaletteDialog.show()}>
                    Command Palette
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer" onSelect={() => setMainViewContent(<PluginManager />)}>
                    Plug Manager
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                    Keyboard Shortcuts
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                    Settings
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu >
    )
}