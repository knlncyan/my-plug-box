// mainViewStore.ts
import { create } from 'zustand';

interface AppViewStore {
    mainViewContent: React.ReactNode;
    // dialogViewContent: React.ReactNode;
    setMainViewContent: (c: React.ReactNode) => void;
    // setDialogViewContent: (c: React.ReactNode) => void;
}

export const useAppViewStore = create<AppViewStore>(set => ({
    mainViewContent: null,
    // dialogViewContent: null,
    setMainViewContent: (c) => set({ mainViewContent: c }),
    // setDialogViewContent: (c) => set({ mainViewContent: c })
}));