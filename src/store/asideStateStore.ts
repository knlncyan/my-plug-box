import initService from '@/api/init.service';
import pluginService from '@/api/plugin.service';
import { create } from 'zustand';


export type AsideBarKeys = 'none' | 'plugs' | 'search' | 'tags'
type PlugViewModes = 'list' | 'grid-small' | 'grid-medium'
type PlugOrderKeys = 'name' | 'activate'
interface AsideState {
    hiddenAside: boolean;
    hiddenBackend: boolean;
    asideBarKey: AsideBarKeys;
    plugViewMode: PlugViewModes;
    plugOrderKey: PlugOrderKeys;

    toggleAside: () => void;
    changeHiddenBackend: () => void;
    changeAsideBarKey: (val: AsideBarKeys) => void;
    changePlugViewMode: (val: PlugViewModes) => void;
    changePlugOrderKey: (val: PlugOrderKeys) => void;

    // 新增：初始化方法
    hydrate: () => Promise<void>;
    persist: () => Promise<void>;
}

const DEFAULT_STATE = {
    hiddenAside: false,
    hiddenBackend: false,
    asideBarKey: 'plugs' as const,
    plugViewMode: 'list' as const,
    plugOrderKey: 'activate' as const,
};

// 如果你不用 zustand/middleware/persist，可以自己实现 hydrate
export const useAsideStateStore = create<AsideState>()((set, get) => ({
    ...DEFAULT_STATE,

    toggleAside: () => set((state) => ({ hiddenAside: !state.hiddenAside })),
    changeHiddenBackend: () => set((state) => ({ hiddenBackend: !state.hiddenBackend })),
    changeAsideBarKey: (val) => set({ asideBarKey: val }),
    changePlugViewMode: (val) => set({ plugViewMode: val }),
    changePlugOrderKey: (val) => set({ plugOrderKey: val }),

    // 手动 hydrate 方法（从 localStorage 加载）
    hydrate: async () => {
        try {
            const saved = (await pluginService.getAllPluginSettings()).data;
            if (saved) {
                set({
                    hiddenAside: saved?.['global.aside.hiddenAside'] == 'true',
                    hiddenBackend: saved?.['global.aside.hiddenBackend'] == 'true',
                    asideBarKey: saved?.['global.aside.asideBarKey'] ?? DEFAULT_STATE.asideBarKey,
                    plugViewMode: saved?.['global.aside.plugViewMode'] ?? DEFAULT_STATE.plugViewMode,
                    plugOrderKey: saved?.['global.aside.plugOrderKey'] ?? DEFAULT_STATE.plugOrderKey,
                });
            }
        } catch (e) {
            console.warn('Failed to hydrate aside state', e);
        }
    },
    // 存储 方法
    persist: async () => {
        try {
            const state = get();
            const settingsToSave = [
                { key: 'global.aside.hiddenAside', value: String(state.hiddenAside) },
                { key: 'global.aside.hiddenBackend', value: String(state.hiddenBackend) },
                { key: 'global.aside.asideBarKey', value: state.asideBarKey },
                { key: 'global.aside.plugViewMode', value: state.plugViewMode },
                { key: 'global.aside.plugOrderKey', value: state.plugOrderKey },
            ];

            await initService.initSettings(settingsToSave);
            console.log('Aside state persisted successfully');
        } catch (e) {
            console.warn('Failed to persist aside state', e);
        }
    },
}));