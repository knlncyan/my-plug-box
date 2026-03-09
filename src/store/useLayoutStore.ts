import { create } from 'zustand';


type AsideKeys = 'none' | 'plugs' | 'search' | 'tags'
type plugViewModels = 'list' | 'grid-small' | 'grid-medium'
interface LayoutContext {
  asideHidden: boolean;
  asideActivatedKey: AsideKeys;
  plugViewModel: plugViewModels;
  toggleAside: () => void;
  asideActivateKey: (val: AsideKeys) => void;
  changePlugViewModel: (val: plugViewModels) => void;
}

export const useLayoutStore = create<LayoutContext>((set) => ({
  asideHidden: false,
  asideActivatedKey: 'plugs',
  plugViewModel: 'list',
  toggleAside: () => set((state) => ({ asideHidden: !state.asideHidden })),
  asideActivateKey: (val: AsideKeys) => set(() => ({ asideActivatedKey: val })),
  changePlugViewModel: (val: plugViewModels) => set(() => ({ plugViewModel: val })),
}));