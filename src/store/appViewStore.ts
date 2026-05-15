// mainViewStore.ts
import { create } from 'zustand';

interface AppViewStore {
    mainViewContent: React.ReactNode;
    setMainViewContent: (c: React.ReactNode) => void;
}

export const useAppViewStore = create<AppViewStore>(set => ({
    mainViewContent: null,
    setMainViewContent: (c) => set({ mainViewContent: c }),
}));