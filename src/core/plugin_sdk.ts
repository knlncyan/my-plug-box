import { invoke } from "@tauri-apps/api/core";
import { ViewMeta } from "./types";

export class PluginAPI {
    constructor(private pluginId: string) { }

    views = {
        register: async (meta: Omit<ViewMeta, 'plugin_id'>) => {
            await invoke('register_view_meta', {
                view: { ...meta, plugin_id: this.pluginId }
            });
        }
    };

}