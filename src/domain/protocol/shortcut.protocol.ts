import { CommandMeta } from "./plugin-entity.protocol";


type ShortcutCategory = 'user' | 'system' | 'command'
export type ShortcutManagerMap = Record<ShortcutCategory, CommandMeta[]>;

export interface ShortcutUpdateDTO {
    id: string,
    category: ShortcutCategory,
    shortcut?: string,
    shortcutScope?: string,
}