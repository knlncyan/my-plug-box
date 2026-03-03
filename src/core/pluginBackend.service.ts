/**
 * Tauri invoke gateway for plugin backend commands.
 * Features:
 * - unified ApiResponse envelope handling
 * - warning/error semantics
 * - frontend response interceptors (from utils) for cross-cutting handling
 */
import { invoke } from '@tauri-apps/api/core';
import type {
  ApiResponse,
  CommandMeta,
  PluginManifestDto,
  PluginSummary,
  ViewMeta,
} from './pluginRuntime.protocol';
import {
  ApiInterceptorPipeline,
  defaultApiLoggingInterceptor,
  type ApiInterceptor,
  type ApiInterceptorContext,
} from '../utils/api-interceptor';

interface InvokeApiOptions {
  allowWarning?: boolean;
}

class PluginBackendService {
  private readonly interceptorPipeline = new ApiInterceptorPipeline();

  /**
  * 初始化默认拦截器。
  */
  constructor() {
    this.addInterceptor(defaultApiLoggingInterceptor);
  }

  /**
  * 注册一个 API 响应拦截器，返回取消注册函数。
  */
  addInterceptor(interceptor: ApiInterceptor): () => void {
    return this.interceptorPipeline.add(interceptor);
  }

  /**
  * 注册插件清单到后端。
  */
  async registerPlugin(manifest: PluginManifestDto): Promise<void> {
    await this.invokeApi<void>('register_js_plugin', { manifest }, { allowWarning: true });
  }

  /**
  * 注册视图元数据到后端。
  */
  async registerView(view: ViewMeta): Promise<void> {
    await this.invokeApi<void>('register_view_meta', { view }, { allowWarning: true });
  }

  /**
  * 注册命令元数据到后端。
  */
  async registerCommand(command: CommandMeta): Promise<void> {
    await this.invokeApi<void>('register_command_meta', { command }, { allowWarning: true });
  }

  /**
  * 激活全部插件。
  */
  async activateAllPlugins(): Promise<void> {
    await this.invokeApi<void>('activate_all_plugins', undefined, { allowWarning: true });
  }

  /**
  * 激活单个插件。
  */
  async activatePlugin(pluginId: string): Promise<void> {
    await this.invokeApi<void>('activate_plugin', { pluginId }, { allowWarning: true });
  }

  /**
  * 停用单个插件。
  */
  async deactivatePlugin(pluginId: string): Promise<void> {
    await this.invokeApi<void>('deactivate_plugin', { pluginId }, { allowWarning: true });
  }

  /**
  * 获取插件列表快照。
  */
  async listPlugins(): Promise<PluginSummary[]> {
    const response = await this.invokeApi<PluginSummary[]>('get_plugin_list');
    return this.unwrapData(response, 'get_plugin_list');
  }

  /**
  * 获取已注册视图列表。
  */
  async listViews(): Promise<ViewMeta[]> {
    const response = await this.invokeApi<ViewMeta[]>('get_registered_views');
    return this.unwrapData(response, 'get_registered_views');
  }

  /**
  * 获取已注册命令列表。
  */
  async listCommands(): Promise<CommandMeta[]> {
    const response = await this.invokeApi<CommandMeta[]>('get_registered_commands');
    return this.unwrapData(response, 'get_registered_commands');
  }

  /**
   * 获取所有插件设置（单文件存储）。
   */
  async getAllPluginSettings(): Promise<Record<string, unknown>> {
    const response = await this.invokeApi<Record<string, unknown>>('get_all_plugin_settings');
    return this.unwrapData(response, 'get_all_plugin_settings');
  }

  /**
   * 设置某个插件的配置项。
   */
  async setPluginSetting(pluginId: string, key: string, value: unknown): Promise<void> {
    await this.invokeApi<void>('set_plugin_setting', { pluginId, key, value }, { allowWarning: true });
  }

  /**
   * 获取某个插件的存储快照（分文件存储）。
   */
  async getPluginStorageSnapshot(pluginId: string): Promise<Record<string, unknown>> {
    const response = await this.invokeApi<Record<string, unknown>>('get_plugin_storage_snapshot', {
      pluginId,
    });
    return this.unwrapData(response, 'get_plugin_storage_snapshot');
  }

  /**
   * 设置某个插件的存储键值。
   */
  async setPluginStorageValue(pluginId: string, key: string, value: unknown): Promise<void> {
    await this.invokeApi<void>(
      'set_plugin_storage_value',
      { pluginId, key, value },
      { allowWarning: true }
    );
  }

  /**
  * 统一调用 Tauri 命令并处理 ApiResponse 语义。
  */
  private async invokeApi<T>(
    command: string,
    payload?: Record<string, unknown>,
    options?: InvokeApiOptions
  ): Promise<ApiResponse<T>> {
    let response: ApiResponse<T>;

    try {
      response = await invoke<ApiResponse<T>>(command, payload);
    } catch (error) {
      throw new Error(`[plugin-backend] ${command} invoke failed: ${String(error)}`);
    }

    this.runInterceptors({ command, payload, response });

    if (response.success) return response;

    const allowWarning = options?.allowWarning ?? false;
    if (allowWarning && response.code === 'WARNING') {
      return response;
    }

    throw new Error(
      `[plugin-backend] ${command} responded with ${response.code}: ${response.message}`
    );
  }

  /**
  * 执行拦截器链。
  */
  private runInterceptors<T>(context: ApiInterceptorContext<ApiResponse<T>>): void {
    this.interceptorPipeline.run(context);
  }

  /**
  * 从 ApiResponse 中提取 data，缺失时抛错。
  */
  private unwrapData<T>(response: ApiResponse<T>, command: string): T {
    if (response.data === undefined || response.data === null) {
      throw new Error(`[plugin-backend] ${command} response data is empty`);
    }
    return response.data;
  }
}

export default new PluginBackendService();
