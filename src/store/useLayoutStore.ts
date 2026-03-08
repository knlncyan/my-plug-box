import { create } from 'zustand';


type AsideKeys = 'none' | 'plugs' | 'search' | 'tags'
interface LayoutContext {
  asideHidden: boolean;
  asideActivatedKey: AsideKeys;
  toggleAside: () => void;
  asideActivateKey: (val: AsideKeys) => void;
}

export const useLayoutStore = create<LayoutContext>((set) => ({
  asideHidden: false,
  asideActivatedKey: 'plugs',
  toggleAside: () => set((state) => ({ asideHidden: !state.asideHidden })),
  asideActivateKey: (val: AsideKeys) => set(() => ({ asideActivatedKey: val })),
}));