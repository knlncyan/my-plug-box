import { create } from 'zustand';

interface LayoutContext {
  asideHidden: boolean;
  toggleAside: () => void;
}

export const useLayoutStore = create<LayoutContext>((set) => ({
  asideHidden: false,
  toggleAside: () => set((state) => ({ asideHidden: !state.asideHidden })),
}));