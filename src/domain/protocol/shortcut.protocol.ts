export interface GlobalShortcutBinding {
    commandId: string;
    shortcut: string;
}

export interface GlobalShortcutRegistrationError extends GlobalShortcutBinding {
    error: string;
}

export interface GlobalShortcutSyncResult {
    registered: GlobalShortcutBinding[];
    failed: GlobalShortcutRegistrationError[];
}

export interface GlobalShortcutTriggeredPayload {
    commandId: string;
    shortcut: string;
}
