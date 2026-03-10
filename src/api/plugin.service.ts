/**
 * Tauri invoke gateway for plugin backend commands.
 * Features:
 * - unified ApiResponse envelope handling
 * - warning/error semantics
 * - frontend response interceptors (from utils) for cross-cutting handling
 */
import api from '@/lib/api';
import type {
    ApiResponse,
    CommandMeta,
    PluginManifestDto,
    PluginSummary,
} from '../domain/protocol/plugin-catalog.protocol';

class PluginBackendService {
    /**
    * 注册插件清单到后端。
    */
    async registerPlugin(manifest: PluginManifestDto): Promise<void> {
        await api.invokeApi<void>('register_js_plugin', { manifest });
    }

    /**
    * 注册命令元数据到后端。
    */
    async registerCommand(command: CommandMeta): Promise<void> {
        await api.invokeApi<void>('register_command_meta', { command });
    }

    /**
    * 激活全部插件。
    */
    async activateAllPlugins(): Promise<void> {
        await api.invokeApi<void>('activate_all_plugins', undefined);
    }

    /**
    * 激活单个插件。
    * TODO：激活插件应当返回数据吗？
    */
    async activatePlugin(pluginId: string): Promise<void> {
        await api.invokeApi<void>('activate_plugin', { pluginId });
    }

    /**
    * 停用单个插件。
    */
    async deactivatePlugin(pluginId: string): Promise<void> {
        await api.invokeApi<void>('deactivate_plugin', { pluginId });
    }

    /**
    * 获取插件列表快照。
    */
    async listPlugins(): Promise<ApiResponse<PluginSummary[]>> {
        return await api.invokeApi<PluginSummary[]>('get_plugin_list');
    }

    /**
    * 获取已注册命令列表。
    */
    async listCommands(): Promise<ApiResponse<CommandMeta[]>> {
        return api.invokeApi<CommandMeta[]>('get_registered_commands');
    }

    /**
     * 获取所有插件设置（单文件存储）。
     */
    async getAllPluginSettings(): Promise<ApiResponse<Record<string, unknown>>> {
        return await api.invokeApi<Record<string, unknown>>('get_all_plugin_settings');
    }

    /**
     * 设置某个插件的配置项。
     */
    async setPluginSetting(pluginId: string, key: string, value: unknown): Promise<void> {
        await api.invokeApi<void>('set_plugin_setting', { pluginId, key, value });
    }

    /**
     * 获取某个插件的存储快照（分文件存储）。
     */
    async getPluginStorageSnapshot(pluginId: string): Promise<ApiResponse<Record<string, unknown>>> {
        return await api.invokeApi<Record<string, unknown>>('get_plugin_storage_snapshot', {
            pluginId,
        });
    }

    /**
     * 设置某个插件的存储键值。
     */
    async setPluginStorageValue(pluginId: string, key: string, value: unknown): Promise<void> {
        await api.invokeApi<void>(
            'set_plugin_storage_value',
            { pluginId, key, value },
        );
    }
}

export default new PluginBackendService();
