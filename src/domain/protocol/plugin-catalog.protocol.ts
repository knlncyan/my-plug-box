/**
 * 插件目录/注册协议：
 * 对应插件清单、视图、命令以及后端 API 响应结构。
 */
export interface ApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  data?: T | null;
}

export interface PluginViewManifest {
  id: string;
  title: string;
  pluginId: string;
  // component_path: string;
  props: Record<string, unknown>;
}

export interface PluginManifestDto {
  id: string;
  name: string;
  version: string;
  description?: string;
  activationEvents?: string[];
  view?: PluginViewManifest;
}

export interface CommandMeta {
  id: string;
  description: string;
  pluginId: string;
}

export interface PluginSummary {
  id: string;
  name: string;
  version: string;
  status: string;
  error?: string;
  description?: string;
  view?: PluginViewManifest
}

export interface BuiltinPluginManifest extends Omit<PluginManifestDto, "view"> {
  view?: Omit<PluginViewManifest, "pluginId">
  commands?: Omit<CommandMeta, "pluginId">[];
}
