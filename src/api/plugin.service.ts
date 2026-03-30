/**
 * Tauri invoke gateway for plugin backend commands.
 */
import api from '@/lib/api';
import type {
    ApiResponse,
    PluginEntry
} from '../domain/protocol/plugin-catalog.protocol';
import type { GlobalShortcutSyncResult } from '../domain/protocol/global-shortcut.protocol';

class PluginService {
    /**
     * 重新加载插件并后端运行时。
     */
    async refreshExternalPlugins(): Promise<ApiResponse<PluginEntry[]>> {
        return await api.invokeApi<PluginEntry[]>('refresh_external_plugins');
    }

    /**
    * 获取后端运行时（不重新加载插件）。
    */
    async getPluginsRuntime(): Promise<ApiResponse<PluginEntry[]>> {
        return await api.invokeApi<PluginEntry[]>('get_plugins_runtime');
    }

    /**
     * 激活插件
     */
    async activatePlugin(pluginId: string): Promise<void> {
        await api.invokeApi<void>('activate_plugin', { pluginId });
    }

    /**
     * 反激活插件
     */
    async deactivatePlugin(pluginId: string): Promise<void> {
        await api.invokeApi<void>('deactivate_plugin', { pluginId });
    }

    /**
     * 停用插件
     */
    async disablePlugin(pluginId: string): Promise<void> {
        await api.invokeApi<void>('disable_plugin', { pluginId });
    }

    // async listPlugins(): Promise<ApiResponse<PluginSummary[]>> {
    //     return await api.invokeApi<PluginSummary[]>('get_plugin_list');
    // }

    // async listCommands(): Promise<ApiResponse<CommandMeta[]>> {
    //     return await api.invokeApi<CommandMeta[]>('get_registered_commands');
    // }

    async syncGlobalShortcuts(bindings: Record<string, string>): Promise<ApiResponse<GlobalShortcutSyncResult>> {
        return await api.invokeApi<GlobalShortcutSyncResult>('sync_global_shortcuts', { bindings });
    }

    async getAllPluginSettings(): Promise<ApiResponse<Record<string, unknown>>> {
        return await api.invokeApi<Record<string, unknown>>('get_all_plugin_settings');
    }

    async setPluginSetting(pluginId: string, key: string, value: unknown): Promise<void> {
        await api.invokeApi<void>('set_plugin_setting', { pluginId, key, value });
    }

    async getPluginStorageSnapshot(pluginId: string): Promise<ApiResponse<Record<string, unknown>>> {
        return await api.invokeApi<Record<string, unknown>>('get_plugin_storage_snapshot', {
            pluginId,
        });
    }

    async setPluginStorageValue(pluginId: string, key: string, value: unknown): Promise<void> {
        await api.invokeApi<void>('set_plugin_storage_value', { pluginId, key, value });
    }
}

export default new PluginService();