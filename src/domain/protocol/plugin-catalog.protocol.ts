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

export interface PluginManifestDto {
  id: string;
  name: string;
  version: string;
  description?: string;
  activationEvents?: string[];
}

export interface ViewMeta {
  id: string;
  title: string;
  plugin_id: string;
  component_path: string;
  props: Record<string, unknown>;
}

export interface CommandMeta {
  id: string;
  description: string;
  plugin_id: string;
}

export interface PluginSummary {
  id: string;
  name: string;
  version: string;
  status: string;
  error?: string;
  description?: string;
}

export interface BuiltinViewContribution {
  id: string;
  title: string;
  component_path: string;
  props?: Record<string, unknown>;
}

export interface BuiltinCommandContribution {
  id: string;
  description: string;
}

export interface BuiltinPluginManifest extends PluginManifestDto {
  views?: BuiltinViewContribution[];
  commands?: BuiltinCommandContribution[];
}
