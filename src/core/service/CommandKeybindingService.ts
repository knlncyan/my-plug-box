import service from '../../api/plugin.service';
import type { CommandMeta } from '../../domain/protocol/plugin-entity.protocol';
import type {
    GlobalShortcutSyncResult,
    GlobalShortcutTriggeredPayload,
} from '../../domain/protocol/shortcut.protocol';
import { PluginSettingService } from './PluginSettingService';

interface PluginViewLocalShortcutKeydownPayload {
    code: string;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    repeat: boolean;
    isComposing: boolean;
    defaultPrevented: boolean;
    targetIsEditable: boolean;
}

interface CommandKeybindingServiceDeps {
    pluginSettingService: PluginSettingService;
}

type Listener = () => void;
type CommandExecutor = (commandId: string) => Promise<unknown>;
type ShortcutOverrideMap = Record<string, string | null>;
type SystemShortcutHandler = () => void | Promise<void>;

const GLOBAL_PLUGIN_ID = 'global';
const KEYBINDING_SETTING_KEY = 'commandKeybindings';
const GLOBAL_SHORTCUT_EVENT = 'global-shortcut-triggered';

const MAIN_KEY_BY_CODE: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    NumpadEnter: 'Enter',
    Tab: 'Tab',
    Escape: 'Escape',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',

    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backquote: '`',

    NumpadAdd: '+',
    NumpadSubtract: '-',
    NumpadMultiply: '*',
    NumpadDivide: '/',
    NumpadDecimal: '.',
};

const TOKEN_TO_MAIN_KEY: Record<string, string> = {
    esc: 'Escape',
    escape: 'Escape',
    enter: 'Enter',
    return: 'Enter',
    tab: 'Tab',
    space: 'Space',
    spacebar: 'Space',
    backspace: 'Backspace',
    delete: 'Delete',
    del: 'Delete',
    insert: 'Insert',
    ins: 'Insert',
    home: 'Home',
    end: 'End',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    up: 'ArrowUp',
    arrowup: 'ArrowUp',
    down: 'ArrowDown',
    arrowdown: 'ArrowDown',
    left: 'ArrowLeft',
    arrowleft: 'ArrowLeft',
    right: 'ArrowRight',
    arrowright: 'ArrowRight',
    '-': '-',
    '=': '=',
    '[': '[',
    ']': ']',
    '\\': '\\',
    ';': ';',
    "'": "'",
    ',': ',',
    '.': '.',
    '/': '/',
    '`': '`',
};

function normalizeShortcutFromKeyEvent(payload: PluginViewLocalShortcutKeydownPayload): string | null {
    const code = payload.code.trim();
    if (!code) return null;

    let mainKey = MAIN_KEY_BY_CODE[code] ?? null;
    if (!mainKey) {
        const keyMatch = code.match(/^Key([A-Z])$/);
        if (keyMatch) mainKey = keyMatch[1];
    }
    if (!mainKey) {
        const digitMatch = code.match(/^Digit([0-9])$/);
        if (digitMatch) mainKey = digitMatch[1];
    }
    if (!mainKey) {
        const numpadDigitMatch = code.match(/^Numpad([0-9])$/);
        if (numpadDigitMatch) mainKey = numpadDigitMatch[1];
    }
    if (!mainKey) {
        const fnMatch = code.match(/^F([1-9]|1\d|2[0-4])$/);
        if (fnMatch) mainKey = `F${fnMatch[1]}`;
    }
    if (!mainKey) return null;

    const hasModifier = payload.ctrlKey || payload.altKey || payload.shiftKey || payload.metaKey;
    const isFunctionKey = /^F([1-9]|1\d|2[0-4])$/.test(mainKey);
    if (!hasModifier && !isFunctionKey) return null;

    const parts: string[] = [];
    if (payload.ctrlKey) parts.push('Ctrl');
    if (payload.altKey) parts.push('Alt');
    if (payload.shiftKey) parts.push('Shift');
    if (payload.metaKey) parts.push('Meta');
    parts.push(mainKey);

    return parts.join('+');
}

function normalizeShortcutFromInput(shortcut: string): string | null {
    const tokens = shortcut
        .split('+')
        .map((it) => it.trim())
        .filter((it) => it.length > 0);
    if (tokens.length === 0) return null;

    let ctrl = false;
    let alt = false;
    let shift = false;
    let meta = false;
    let mainKey: string | null = null;

    for (const token of tokens) {
        const lower = token.toLowerCase();
        if (lower === 'ctrl' || lower === 'control') {
            ctrl = true;
            continue;
        }
        if (lower === 'alt' || lower === 'option') {
            alt = true;
            continue;
        }
        if (lower === 'shift') {
            shift = true;
            continue;
        }
        if (
            lower === 'meta' ||
            lower === 'cmd' ||
            lower === 'command' ||
            lower === 'super' ||
            lower === 'win' ||
            lower === 'windows'
        ) {
            meta = true;
            continue;
        }

        if (mainKey !== null) return null;

        const aliasKey = TOKEN_TO_MAIN_KEY[lower];
        if (aliasKey) {
            mainKey = aliasKey;
            continue;
        }

        const fnMatch = lower.match(/^f([1-9]|1\d|2[0-4])$/);
        if (fnMatch) {
            mainKey = `F${fnMatch[1]}`;
            continue;
        }

        if (token.length === 1) {
            mainKey = /[a-z]/i.test(token) ? token.toUpperCase() : token;
            continue;
        }

        mainKey = token.charAt(0).toUpperCase() + token.slice(1);
    }

    if (!mainKey) return null;

    const normalizedMainKey = mainKey.toLowerCase();
    if (
        normalizedMainKey === 'ctrl' ||
        normalizedMainKey === 'control' ||
        normalizedMainKey === 'alt' ||
        normalizedMainKey === 'option' ||
        normalizedMainKey === 'shift' ||
        normalizedMainKey === 'meta' ||
        normalizedMainKey === 'cmd' ||
        normalizedMainKey === 'command' ||
        normalizedMainKey === 'super' ||
        normalizedMainKey === 'win' ||
        normalizedMainKey === 'windows'
    ) {
        return null;
    }

    const hasModifier = ctrl || alt || shift || meta;
    const isFunctionKey = /^F([1-9]|1\d|2[0-4])$/.test(mainKey);
    if (!hasModifier && !isFunctionKey) return null;

    const parts: string[] = [];
    if (ctrl) parts.push('Ctrl');
    if (alt) parts.push('Alt');
    if (shift) parts.push('Shift');
    if (meta) parts.push('Meta');
    parts.push(mainKey);

    return parts.join('+');
}

export class CommandKeybindingService {
    private started = false;
    private readonly commandsById = new Map<string, CommandMeta>();
    private readonly effectiveByCommandId = new Map<string, string>();
    private readonly commandByShortcut = new Map<string, string>();
    private readonly listeners = new Set<Listener>();
    private keydownHandler: ((event: KeyboardEvent) => void) | null = null;
    private commandExecutor: CommandExecutor | null = null;
    private overrides: ShortcutOverrideMap = {};
    private loadPromise: Promise<void> | null = null;
    private globalShortcutUnlisten: (() => void) | null = null;
    private readonly registeredGlobalShortcuts = new Set<string>();
    private readonly systemShortcutMap = new Map<string, SystemShortcutHandler>();
    private syncSerial = 0;

    constructor(private readonly deps: CommandKeybindingServiceDeps) {}

    setCommandExecutor(executor: CommandExecutor): void {
        this.commandExecutor = executor;
    }

    registerSystemShortcut(shortcut: string, handler: SystemShortcutHandler): () => void {
        const normalized = normalizeShortcutFromInput(shortcut);
        if (!normalized) {
            throw new Error(`Invalid system shortcut: ${shortcut}`);
        }

        const conflictCommandId = this.commandByShortcut.get(normalized);
        if (conflictCommandId && conflictCommandId !== 'system') {
            throw new Error(`Shortcut conflict: ${normalized} already bound to ${conflictCommandId}`);
        }
        if (this.systemShortcutMap.has(normalized)) {
            throw new Error(`Shortcut conflict: ${normalized} already bound to system`);
        }

        this.systemShortcutMap.set(normalized, handler);

        return () => {
            const current = this.systemShortcutMap.get(normalized);
            if (!current || current !== handler) return;
            this.systemShortcutMap.delete(normalized);
        };
    }

    onDidChange(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    async start(): Promise<void> {
        if (this.started) return;
        this.started = true;

        await this.ensureOverridesLoaded();
        this.bindLocalKeydownListener();
        await this.bindGlobalShortcutListener();
        this.scheduleGlobalShortcutSync();
    }

    stop(): void {
        if (!this.started) return;
        this.started = false;

        if (this.keydownHandler) {
            window.removeEventListener('keydown', this.keydownHandler, true);
            this.keydownHandler = null;
        }

        if (this.globalShortcutUnlisten) {
            this.globalShortcutUnlisten();
            this.globalShortcutUnlisten = null;
        }

        this.registeredGlobalShortcuts.clear();

        if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in (window as unknown as Record<string, unknown>)) {
            void service.syncGlobalShortcuts({}).catch((error) => {
                console.warn('[Keybinding] clear global shortcuts failed:', error);
            });
        }
    }

    setCommandCatalog(commands: CommandMeta[]): void {
        this.commandsById.clear();
        for (const command of commands) {
            this.commandsById.set(command.id, { ...command });
        }
        this.rebuildEffectiveBindings();
    }

    decorateCommands(commands: CommandMeta[]): CommandMeta[] {
        return commands.map((command) => ({
            ...command,
            shortcut: this.effectiveByCommandId.get(command.id),
        }));
    }

    getUserShortcutOverrides(): ShortcutOverrideMap {
        return { ...this.overrides };
    }

    async setUserShortcut(commandId: string, shortcut: string | null): Promise<void> {
        if (!this.commandsById.has(commandId)) {
            throw new Error(`Command not found: ${commandId}`);
        }

        let normalized: string | null = null;
        if (shortcut !== null) {
            normalized = normalizeShortcutFromInput(shortcut);
            if (!normalized) {
                throw new Error(`Invalid shortcut: ${shortcut}`);
            }

            if (this.systemShortcutMap.has(normalized)) {
                throw new Error(`Shortcut conflict: ${normalized} already bound to system`);
            }

            const conflict = this.commandByShortcut.get(normalized);
            if (conflict && conflict !== commandId) {
                throw new Error(`Shortcut conflict: ${normalized} already bound to ${conflict}`);
            }
        }

        this.overrides[commandId] = normalized;
        await this.persistOverrides();
        this.rebuildEffectiveBindings();
    }

    async clearUserShortcut(commandId: string): Promise<void> {
        delete this.overrides[commandId];
        await this.persistOverrides();
        this.rebuildEffectiveBindings();
    }

    handleLocalShortcutKeydown(payload: PluginViewLocalShortcutKeydownPayload): boolean {
        if (!this.started) return false;
        if (payload.defaultPrevented || payload.isComposing || payload.repeat) return false;
        if (payload.targetIsEditable) return false;

        const shortcut = normalizeShortcutFromKeyEvent(payload);
        if (!shortcut) return false;

        if (this.registeredGlobalShortcuts.has(shortcut)) {
            return false;
        }

        const commandId = this.systemShortcutMap.has(shortcut)
            ? 'system'
            : this.commandByShortcut.get(shortcut);
        if (!commandId) return false;

        if (commandId === 'system') {
            const handler = this.systemShortcutMap.get(shortcut);
            if (!handler) return false;

            Promise.resolve(handler()).catch((error) => {
                console.error(`[Keybinding] system shortcut handler failed: ${shortcut}`, error);
            });
            return true;
        }

        if (!this.commandExecutor) {
            console.warn(`[Keybinding] command executor is not configured: ${commandId}`);
            return false;
        }

        void this.commandExecutor(commandId).catch((error) => {
            console.error(`[Keybinding] command execution failed: ${commandId}`, error);
        });

        return true;
    }

    private bindLocalKeydownListener(): void {
        this.keydownHandler = (event: KeyboardEvent) => {
            const target = event.target;
            const targetIsEditable =
                target instanceof HTMLElement &&
                (target.isContentEditable ||
                    target.tagName.toLowerCase() === 'input' ||
                    target.tagName.toLowerCase() === 'textarea' ||
                    target.tagName.toLowerCase() === 'select');

            const handled = this.handleLocalShortcutKeydown({
                code: event.code,
                ctrlKey: event.ctrlKey,
                altKey: event.altKey,
                shiftKey: event.shiftKey,
                metaKey: event.metaKey,
                repeat: event.repeat,
                isComposing: event.isComposing,
                defaultPrevented: event.defaultPrevented,
                targetIsEditable,
            });
            if (!handled) return;

            event.preventDefault();
            event.stopPropagation();
        };

        window.addEventListener('keydown', this.keydownHandler, true);
    }

    private async bindGlobalShortcutListener(): Promise<void> {
        if (
            typeof window === 'undefined' ||
            !('__TAURI_INTERNALS__' in (window as unknown as Record<string, unknown>)) ||
            this.globalShortcutUnlisten
        ) {
            return;
        }

        try {
            const { listen } = await import('@tauri-apps/api/event');
            this.globalShortcutUnlisten = await listen<GlobalShortcutTriggeredPayload>(
                GLOBAL_SHORTCUT_EVENT,
                (event) => {
                    const payload = event.payload;
                    if (!payload || typeof payload.commandId !== 'string') {
                        return;
                    }

                    const commandId = payload.commandId;
                    if (!this.commandsById.has(commandId)) {
                        console.warn(`[Keybinding] received unknown command from global shortcut: ${commandId}`);
                        return;
                    }

                    if (!this.commandExecutor) {
                        console.warn(`[Keybinding] command executor is not configured: ${commandId}`);
                        return;
                    }

                    void this.commandExecutor(commandId).catch((error) => {
                        console.error(`[Keybinding] global shortcut execution failed: ${commandId}`, error);
                    });
                }
            );
        } catch (error) {
            console.warn('[Keybinding] bind global shortcut event failed:', error);
        }
    }

    private scheduleGlobalShortcutSync(): void {
        if (
            !this.started ||
            typeof window === 'undefined' ||
            !('__TAURI_INTERNALS__' in (window as unknown as Record<string, unknown>))
        ) {
            return;
        }

        const serial = ++this.syncSerial;
        const bindings: Record<string, string> = {};

        for (const [commandId, shortcut] of this.effectiveByCommandId.entries()) {
            const command = this.commandsById.get(commandId);
            if ((command?.shortcutScope ?? 'local') !== 'global') {
                continue;
            }
            bindings[commandId] = shortcut;
        }

        void service
            .syncGlobalShortcuts(bindings)
            .then((response) => {
                if (serial !== this.syncSerial) {
                    return;
                }
                this.applyGlobalSyncResult(response.data);
            })
            .catch((error) => {
                if (serial !== this.syncSerial) {
                    return;
                }
                this.registeredGlobalShortcuts.clear();
                console.warn('[Keybinding] sync global shortcuts failed:', error);
            });
    }

    private applyGlobalSyncResult(result: GlobalShortcutSyncResult | null): void {
        this.registeredGlobalShortcuts.clear();
        if (!result) return;

        for (const item of result.registered) {
            const normalized = normalizeShortcutFromInput(item.shortcut);
            if (normalized) {
                this.registeredGlobalShortcuts.add(normalized);
            }
        }

        if (result.failed.length > 0) {
            console.warn('[Keybinding] global shortcut partial failures:', result.failed);
        }
    }

    private async ensureOverridesLoaded(): Promise<void> {
        if (!this.loadPromise) {
            this.loadPromise = this.loadOverrides();
        }
        await this.loadPromise;
    }

    private async loadOverrides(): Promise<void> {
        const value = await this.deps.pluginSettingService.get<unknown>(
            GLOBAL_PLUGIN_ID,
            KEYBINDING_SETTING_KEY
        );

        this.overrides = {};
        if (value && typeof value === 'object') {
            for (const [commandId, raw] of Object.entries(value as Record<string, unknown>)) {
                if (raw === null) {
                    this.overrides[commandId] = null;
                    continue;
                }
                if (typeof raw === 'string') {
                    this.overrides[commandId] = normalizeShortcutFromInput(raw);
                }
            }
        }

        this.rebuildEffectiveBindings();
    }

    private async persistOverrides(): Promise<void> {
        await this.deps.pluginSettingService.persist(
            GLOBAL_PLUGIN_ID,
            KEYBINDING_SETTING_KEY,
            this.overrides
        );
    }

    private rebuildEffectiveBindings(): void {
        this.effectiveByCommandId.clear();
        this.commandByShortcut.clear();

        for (const command of this.commandsById.values()) {
            const override = this.overrides[command.id];
            if (override === null) {
                continue;
            }

            let normalized: string | null = null;
            if (typeof override === 'string') {
                normalized = normalizeShortcutFromInput(override);
            } else if (typeof command.shortcut === 'string') {
                normalized = normalizeShortcutFromInput(command.shortcut);
            }

            if (!normalized) continue;
            if (this.systemShortcutMap.has(normalized)) continue;
            if (this.commandByShortcut.has(normalized)) continue;

            this.effectiveByCommandId.set(command.id, normalized);
            this.commandByShortcut.set(normalized, command.id);
        }

        this.scheduleGlobalShortcutSync();
        for (const listener of this.listeners) {
            listener();
        }
    }
}

