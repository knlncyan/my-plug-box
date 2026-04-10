import { MyDialogPortal } from "@/components/MyDialogPortal";
import { Input } from "@/components/ui/input";
import { useCoreRuntime } from "@/core";
import { CommandMeta } from "@/domain/protocol";
import { createPopup } from "@/lib/zustand";
import {
    clearCapturedShortcut,
    setShortcutCapturing,
    useShortcutCaptureStore,
} from "@/store/shortcutCaptureStore";
import {
    useEffect,
    useMemo,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
} from "react";
import { toast } from "sonner";

interface EditShortcutDialogAction {
    refreshKeybindings: () => void;
    queryKeybindings: (val: string) => void;
}

export const useEditShortcutDialog = createPopup<CommandMeta, EditShortcutDialogAction>();

const CLEAR_KEYS = ['Backspace', 'Escape', 'Delete'];

const SUBMIT_KEYS = ['Enter', 'NumpadEnter'];

const CODE_TO_MAIN_KEY: Record<string, string> = {
    Space: 'Space',
    // Enter: 'Enter',
    // NumpadEnter: 'Enter',
    Tab: 'Tab',

    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',

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

function isModifierCode(code: string): boolean {
    return (
        code === 'ControlLeft' ||
        code === 'ControlRight' ||
        code === 'AltLeft' ||
        code === 'AltRight' ||
        code === 'ShiftLeft' ||
        code === 'ShiftRight' ||
        code === 'MetaLeft' ||
        code === 'MetaRight'
    );
}

function normalizeModifierByCode(code: string): string | null {
    if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
    if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
    if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
    if (code === 'MetaLeft' || code === 'MetaRight') return 'Meta';
    return null;
}

function normalizeMainKeyByCode(code: string): string | null {
    if (!code) return null;

    if (CODE_TO_MAIN_KEY[code]) {
        return CODE_TO_MAIN_KEY[code];
    }

    const keyMatch = code.match(/^Key([A-Z])$/);
    if (keyMatch) return keyMatch[1];

    const digitMatch = code.match(/^Digit([0-9])$/);
    if (digitMatch) return digitMatch[1];

    const numpadDigitMatch = code.match(/^Numpad([0-9])$/);
    if (numpadDigitMatch) return numpadDigitMatch[1];

    const fnMatch = code.match(/^F([1-9]|1\d|2[0-4])$/);
    if (fnMatch) return `F${fnMatch[1]}`;

    return null;
}

function normalizeKeyTokenFromEvent(event: ReactKeyboardEvent<HTMLInputElement>): string | null {
    const modifier = normalizeModifierByCode(event.code);
    if (modifier) return modifier;

    if (isModifierCode(event.code)) return null;
    return normalizeMainKeyByCode(event.code);
}

function isIllegalKeybinding(shortcutValue: string): boolean {
    const parts = shortcutValue.split('+');
    if (parts.length < 2) return true;
    const last = parts[parts.length - 1];
    return last == 'Ctrl' || last == 'Alt' || last == 'Shift' || last == 'Meta';
}

export default function EditShortcutDialog() {
    const { open, data, action } = useEditShortcutDialog.use();
    const { updateShortcutBinding } = useCoreRuntime();
    const [shortcutValue, setShortcutValue] = useState('');
    const capturedShortcutPayload = useShortcutCaptureStore((state) => state.capturedShortcutPayload);

    const isSame = data?.shortcut?.toLocaleLowerCase() == shortcutValue.toLocaleLowerCase();

    const keyParts = useMemo(
        () => (shortcutValue ? shortcutValue.split('+') : []),
        [shortcutValue]
    );

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
        event.preventDefault();
        event.stopPropagation();

        if (event.repeat) {
            return;
        }

        if (CLEAR_KEYS.includes(event.code)) {
            clearCapturedShortcut();
            setShortcutValue('');
            return;
        }

        if (SUBMIT_KEYS.includes(event.code)) {
            handleSubmit();
            return;
        }

        const parts: string[] = [];
        if (event.ctrlKey) parts.push('Ctrl');
        if (event.altKey) parts.push('Alt');
        if (event.shiftKey) parts.push('Shift');
        if (event.metaKey) parts.push('Meta');
        const normalizedToken = normalizeKeyTokenFromEvent(event);
        if (normalizedToken && !parts.includes(normalizedToken)) {
            parts.push(normalizedToken);
        }

        if (parts.length === 0) return;
        setShortcutValue(parts.join('+'));
        clearCapturedShortcut();
    };

    const handleClose = () => {
        setShortcutValue('');
        setShortcutCapturing(false);
        clearCapturedShortcut();
        useEditShortcutDialog.hide();
    }

    const handleConflict = () => {
        if (isSame) return;
        action?.queryKeybindings(shortcutValue);
        handleClose();
    }

    const handleSubmit = async () => {
        if (!data) {
            toast.error('not exist any command', { position: 'top-center' });
            return;
        }
        if (isSame) {
            toast.warning('same as old keybinding', { position: 'top-center' });
            return;
        }
        if (capturedShortcutPayload) {
            toast.warning('exist command has like this keybinging', { position: 'top-center' });
            return;
        };
        if (isIllegalKeybinding(shortcutValue)) {
            toast.warning('illegal keybinging', { position: 'top-center' });
            return;
        }
        await updateShortcutBinding({
            id: data?.id,
            category: data.pluginId == 'system' ? 'system' : 'command',
            shortcut: shortcutValue ? shortcutValue : undefined,
            shortcutScope: data.shortcutScope ? data.shortcutScope : 'local',
        });
        toast.success('success', { position: 'top-center' });
        action?.refreshKeybindings();
        handleClose();
    }

    useEffect(() => {
        if (!capturedShortcutPayload) return;
        setShortcutValue(capturedShortcutPayload.shortcut ?? 'undefine');
    }, [capturedShortcutPayload]);

    useEffect(() => {
        if (open) {
            setShortcutCapturing(true);
        }
    }, [open]);

    return (
        <MyDialogPortal open={open} onClose={handleClose}>
            <div className="flex flex-col w-100 items-center justify-center bg-neutral-100 rounded-lg px-2 py-4 gap-2">
                <div className="text-xs text-neutral-700">Press desired key combination and then press Enter</div>
                <Input
                    type="text"
                    autoFocus
                    className="w-full h-8 bg-white text-center text-neutral-600"
                    value={shortcutValue}
                    onKeyDown={handleKeyDown}
                    // 空的onChange为了消除副作用，readonly会导致看不到光标
                    onChange={() => null}
                />
                <div className="flex justify-center h-6 w-full gap-1">
                    {keyParts.map((key, index) => (
                        <Tag key={`${key}-${index}`}>{key}</Tag>
                    ))}
                </div>
                <div className={`h-3 text-xs ${isSame ? 'text-neutral-700' : 'text-red-700 underline'} cursor-pointer`} onClick={handleConflict}>
                    {isSame ? 'same as the old keybinding' : (capturedShortcutPayload && 'exist command has like this keybinging')}
                </div>
            </div>
        </MyDialogPortal>
    );
}

function Tag({ children }: { children: ReactNode }) {
    return (
        <span className="flex items-center  px-2 h-6 text-white bg-neutral-350 rounded text-sm font-medium">
            {children}
        </span>
    );
}
