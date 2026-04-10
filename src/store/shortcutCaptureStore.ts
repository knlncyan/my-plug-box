import { CommandMeta } from '@/domain/protocol';
import { create } from 'zustand';

interface ShortcutCaptureState {
    isCapturing: boolean;
    capturedShortcutPayload: CommandMeta | null;
    setCapturing: (capturing: boolean) => void;
    setCaptured: (shortcut: CommandMeta) => void;
    clearCaptured: () => void;
}

export const useShortcutCaptureStore = create<ShortcutCaptureState>((set) => ({
    isCapturing: false,
    capturedShortcutPayload: null,
    setCapturing: (capturing) => set({ isCapturing: capturing }),
    setCaptured: (shortcut) => set({ capturedShortcutPayload: shortcut }),
    clearCaptured: () => set({ capturedShortcutPayload: null }),
}));

export function setShortcutCapturing(capturing: boolean): void {
    useShortcutCaptureStore.getState().setCapturing(capturing);
}

export function getShortcutCapturing(): boolean {
    return useShortcutCaptureStore.getState().isCapturing;
}

export function setCapturedShortcut(shortcut: CommandMeta): void {
    useShortcutCaptureStore.getState().setCaptured(shortcut);
}

export function clearCapturedShortcut(): void {
    useShortcutCaptureStore.getState().clearCaptured();
}
