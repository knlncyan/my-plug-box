import { CommandMeta, ShortcutManagerMap, ShortcutUpdateDTO } from "@/domain/protocol";
import api from "@/lib/api";

class ShortcutService {
    async getShortcutList() {
        return await api.invokeApi<ShortcutManagerMap | null>('get_shortcut_list');
    }

    async updateShortcut(dto: ShortcutUpdateDTO) {
        return await api.invokeApi<CommandMeta>('update_shortcut', { dto });
    }

    async resetShortcut(dto: ShortcutUpdateDTO) {
        return await api.invokeApi<CommandMeta>('reset_shortcut', { dto });
    }
}

export default new ShortcutService();