/**
 * Tauri invoke gateway for plugin backend commands.
 */
import api from '@/lib/api';
import type {
    ApiResponse,
    CommandMeta,
    PluginManifest,
    PluginSummary,
} from '../domain/protocol/plugin-catalog.protocol';
import type { GlobalShortcutSyncResult } from '../domain/protocol/global-shortcut.protocol';

class PluginService {
    /**
     * 刷新插件索引（后端扫描 + 注册）。
     */
    async refreshExternalPlugins(): Promise<ApiResponse<PluginManifest[]>> {
        return await api.invokeApi<PluginManifest[]>('refresh_external_plugins');
    }

    async activatePlugin(pluginId: string): Promise<void> {
        await api.invokeApi<void>('activate_plugin', { pluginId });
    }

    async deactivatePlugin(pluginId: string): Promise<void> {
        await api.invokeApi<void>('deactivate_plugin', { pluginId });
    }

    async disablePlugin(pluginId: string): Promise<void> {
        await api.invokeApi<void>('disable_plugin', { pluginId });
    }

    async listPlugins(): Promise<ApiResponse<PluginSummary[]>> {
        return await api.invokeApi<PluginSummary[]>('get_plugin_list');
    }

    async listCommands(): Promise<ApiResponse<CommandMeta[]>> {
        return await api.invokeApi<CommandMeta[]>('get_registered_commands');
    }

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