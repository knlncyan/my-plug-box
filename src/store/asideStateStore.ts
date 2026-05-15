import pluginService from '@/api/plugin.service';
import { debounce } from 'lodash';
import { create } from 'zustand';


export type AsideBarKeys = 'none' | 'plugs' | 'search' | 'tags'
type PlugViewModes = 'list' | 'grid-small' | 'grid-medium'
type PlugOrderKeys = 'name' | 'activate'
interface AsideState {
    hydrated: boolean;
    hiddenAside: boolean;
    hiddenBackend: boolean;
    hiddenDisabled: boolean;
    asideBarKey: AsideBarKeys;
    plugViewMode: PlugViewModes;
    plugOrderKey: PlugOrderKeys;

    toggleAside: () => void;
    changeHiddenBackend: () => void;
    changeHiddenDisabled: () => void;
    changeAsideBarKey: (val: AsideBarKeys) => void;
    changePlugViewMode: (val: PlugViewModes) => void;
    changePlugOrderKey: (val: PlugOrderKeys) => void;

    // 新增：初始化方法
    hydrate: () => Promise<void>;
    persist: () => Promise<void>;
}

const DEFAULT_STATE = {
    hydrated: false,
    hiddenAside: false,
    hiddenBackend: false,
    hiddenDisabled: false,
    asideBarKey: 'plugs' as const,
    plugViewMode: 'list' as const,
    plugOrderKey: 'activate' as const,
};

// 如果你不用 zustand/middleware/persist，可以自己实现 hydrate
export const useAsideStateStore = create<AsideState>()((set, get) => ({
    ...DEFAULT_STATE,

    toggleAside: () => set((state) => ({ hiddenAside: !state.hiddenAside })),
    changeHiddenBackend: () => set((state) => ({ hiddenBackend: !state.hiddenBackend })),
    changeHiddenDisabled: () => set((state) => ({ hiddenDisabled: !state.hiddenDisabled })),
    changeAsideBarKey: (val) => set({ asideBarKey: val }),
    changePlugViewMode: (val) => set({ plugViewMode: val }),
    changePlugOrderKey: (val) => set({ plugOrderKey: val }),

    // 手动 hydrate 方法（从 localStorage 加载）
    hydrate: async () => {
        try {
            const saved = (await pluginService.getAllPluginSettings()).data;
            const asideSetting = saved?.['global.asideSetting'] as Record<string, any>;
            if (asideSetting) {
                set({
                    hydrated: true,
                    hiddenAside: asideSetting?.hiddenAside == 'true',
                    hiddenBackend: asideSetting?.hiddenBackend == 'true',
                    hiddenDisabled: asideSetting?.hiddenDisabled == 'true',
                    asideBarKey:
                        asideSetting?.asideBarKey ?? DEFAULT_STATE.asideBarKey,
                    plugViewMode:
                        asideSetting?.plugViewMode ?? DEFAULT_STATE.plugViewMode,
                    plugOrderKey:
                        asideSetting?.plugOrderKey ?? DEFAULT_STATE.plugOrderKey,
                });
            } else {
                set({ hydrated: true });
            }
        } catch (e) {
            set({ hydrated: true });
            console.warn('Failed to hydrate aside state', e);
        }
    },
    // 存储 方法
    persist: async () => {
        try {
            const state = get();
            const settingsToSave = {
                hiddenAside: String(state.hiddenAside),
                hiddenBackend: String(state.hiddenBackend),
                hiddenDisabled: String(state.hiddenDisabled),
                asideBarKey: String(state.asideBarKey),
                plugViewMode: String(state.plugViewMode),
                plugOrderKey: String(state.plugOrderKey),
            }

            await pluginService.setPluginSetting("global", "asideSetting", settingsToSave);
            console.log('Aside state persisted successfully');
        } catch (e) {
            console.warn('Failed to persist aside state', e);
        }
    },
}));

const debouncePersist = debounce(() => {
    useAsideStateStore.getState().persist();
}, 800)

useAsideStateStore.subscribe(debouncePersist);
