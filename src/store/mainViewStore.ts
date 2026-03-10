// mainViewStore.ts
import { create } from 'zustand';

interface MainViewStore {
    viewContent: React.ReactNode;
    setViewContent: (c: React.ReactNode) => void
}

export const useMainViewStore = create<MainViewStore>(set => ({
    viewContent: null,
    setViewContent: (c) => set({ viewContent: c })
}));