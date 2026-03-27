import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCoreRuntime } from '@/core';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { toast } from 'sonner';

const CODE_TO_MAIN_KEY: Record<string, string> = {
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

function isModifierKey(key: string): boolean {
    const lower = key.toLowerCase();
    return (
        lower === 'shift' ||
        lower === 'control' ||
        lower === 'ctrl' ||
        lower === 'alt' ||
        lower === 'meta' ||
        lower === 'os'
    );
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

function normalizeShortcutFromEvent(event: ReactKeyboardEvent<HTMLInputElement>): string | null {
    const mainKey = normalizeMainKeyByCode(event.code);
    if (!mainKey || isModifierKey(mainKey)) return null;

    const hasModifier = event.ctrlKey || event.altKey || event.shiftKey || event.metaKey;
    const isFunctionKey = /^F([1-9]|1\d|2[0-4])$/.test(mainKey);
    if (!hasModifier && !isFunctionKey) {
        return null;
    }

    const parts: string[] = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');
    parts.push(mainKey);

    return parts.join('+');
}

export default function KeyboardShortcutsPage() {
    const { commands, setCommandShortcut, clearCommandShortcut } = useCoreRuntime();
    const [query, setQuery] = useState('');
    const [draftMap, setDraftMap] = useState<Record<string, string>>({});
    const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});

    const filteredCommands = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        const list = [...commands].sort((a, b) => a.id.localeCompare(b.id));
        if (!keyword) return list;

        return list.filter((item) => {
            return (
                item.id.toLowerCase().includes(keyword) ||
                item.description.toLowerCase().includes(keyword) ||
                item.pluginId.toLowerCase().includes(keyword)
            );
        });
    }, [commands, query]);

    function getDraftValue(commandId: string, fallback?: string): string {
        if (Object.prototype.hasOwnProperty.call(draftMap, commandId)) {
            return draftMap[commandId] ?? '';
        }
        return fallback ?? '';
    }

    function setDraftValue(commandId: string, value: string): void {
        setDraftMap((prev) => ({
            ...prev,
            [commandId]: value,
        }));
    }

    async function saveShortcut(commandId: string): Promise<void> {
        const raw = (draftMap[commandId] ?? '').trim();
        setSavingMap((prev) => ({ ...prev, [commandId]: true }));

        try {
            if (!raw) {
                await clearCommandShortcut(commandId);
                setDraftMap((prev) => {
                    const next = { ...prev };
                    delete next[commandId];
                    return next;
                });
                toast.success(`Shortcut reset: ${commandId}`);
                return;
            }

            await setCommandShortcut(commandId, raw);
            setDraftMap((prev) => ({ ...prev, [commandId]: raw }));
            toast.success(`Shortcut saved: ${commandId}`);
        } catch (error) {
            toast.error(String(error));
        } finally {
            setSavingMap((prev) => ({ ...prev, [commandId]: false }));
        }
    }

    async function resetShortcut(commandId: string): Promise<void> {
        setSavingMap((prev) => ({ ...prev, [commandId]: true }));

        try {
            await clearCommandShortcut(commandId);
            setDraftMap((prev) => {
                const next = { ...prev };
                delete next[commandId];
                return next;
            });
            toast.success(`Shortcut reset: ${commandId}`);
        } catch (error) {
            toast.error(String(error));
        } finally {
            setSavingMap((prev) => ({ ...prev, [commandId]: false }));
        }
    }

    function handleShortcutKeydown(commandId: string, event: ReactKeyboardEvent<HTMLInputElement>): void {
        event.preventDefault();
        event.stopPropagation();

        // Delete / Backspace / Escape 视为清空草稿。
        if (event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Escape') {
            setDraftValue(commandId, '');
            return;
        }

        const shortcut = normalizeShortcutFromEvent(event);
        if (!shortcut) return;

        setDraftValue(commandId, shortcut);
    }

    return (
        <div className="h-full overflow-auto bg-neutral-50 p-4">
            <div className="mx-auto flex max-w-5xl flex-col gap-4">
                <div className="rounded-lg border border-neutral-200 bg-white p-4">
                    <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
                    <p className="mt-1 text-xs text-neutral-500">
                        聚焦输入框后直接按下组合键录制；按 Delete / Backspace / Escape 可清空。
                    </p>
                    <div className="relative mt-3">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                        <Input
                            className="pl-9"
                            placeholder="Search command id / description / plugin"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
                    <div className="grid grid-cols-[2fr_2fr_1fr_2fr] gap-3 border-b border-neutral-200 bg-neutral-100 px-4 py-2 text-xs font-medium text-neutral-600">
                        <span>Command</span>
                        <span>Description</span>
                        <span>Plugin</span>
                        <span>Shortcut</span>
                    </div>

                    {filteredCommands.length === 0 && (
                        <div className="p-6 text-center text-sm text-neutral-500">No commands found.</div>
                    )}

                    {filteredCommands.map((item) => {
                        const saving = savingMap[item.id] === true;
                        const value = getDraftValue(item.id, item.shortcut);

                        return (
                            <div
                                key={item.id}
                                className="grid grid-cols-[2fr_2fr_1fr_2fr] gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0"
                            >
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-medium text-neutral-900">{item.id}</div>
                                </div>

                                <div className="min-w-0">
                                    <div className="truncate text-sm text-neutral-700">{item.description}</div>
                                </div>

                                <div className="min-w-0">
                                    <div className="truncate text-xs text-neutral-500">{item.pluginId}</div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Input
                                        readOnly
                                        value={value}
                                        placeholder="Press shortcut..."
                                        onKeyDown={(event) => handleShortcutKeydown(item.id, event)}
                                    />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={saving}
                                        onClick={() => {
                                            void saveShortcut(item.id);
                                        }}
                                    >
                                        保存
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={saving}
                                        onClick={() => {
                                            void resetShortcut(item.id);
                                        }}
                                    >
                                        清空
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
