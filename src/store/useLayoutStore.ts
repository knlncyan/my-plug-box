import { create } from 'zustand';


type AsideKeys = 'none' | 'plugs' | 'search' | 'tags'
type PlugViewModels = 'list' | 'grid-small' | 'grid-medium'
type PlugOrderKeys = 'name' | 'activate'
interface LayoutContext {
  asideHidden: boolean;
  asideActivatedKey: AsideKeys;
  plugViewModel: PlugViewModels;
  plugOrderKey: PlugOrderKeys;
  toggleAside: () => void;
  asideActivateKey: (val: AsideKeys) => void;
  changePlugViewModel: (val: PlugViewModels) => void;
  changePlugOrderKey: (val: PlugOrderKeys) => void;
}

export const useLayoutStore = create<LayoutContext>((set) => ({
  asideHidden: false,
  asideActivatedKey: 'plugs',
  plugViewModel: 'list',
  plugOrderKey: 'activate',
  toggleAside: () => set((state) => ({ asideHidden: !state.asideHidden })),
  asideActivateKey: (val: AsideKeys) => set(() => ({ asideActivatedKey: val })),
  changePlugViewModel: (val: PlugViewModels) => set(() => ({ plugViewModel: val })),
  changePlugOrderKey: (val: PlugOrderKeys) => set(() => ({ plugOrderKey: val })),
}));