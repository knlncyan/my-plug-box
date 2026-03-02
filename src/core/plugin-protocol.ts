/**
 * Shared plugin protocol types between frontend runtime and Tauri backend.
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
  expose: boolean;
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
  expose?: boolean;
}

export interface BuiltinPluginManifest extends PluginManifestDto {
  activationEvents?: string[];
  views?: BuiltinViewContribution[];
  commands?: BuiltinCommandContribution[];
}

export interface PluginDisposable {
  dispose(): void;
}

export interface PluginHostAPI {
  readonly pluginId: string;
  commands: {
    execute(commandId: string, ...args: unknown[]): Promise<unknown>;
  };
  views: {
    activate(viewId: string): void;
  };
  events: {
    emit(event: string, payload?: unknown): void;
    on(event: string, handler: (payload: unknown) => void): PluginDisposable;
  };
  settings: {
    get<T>(key: string): T | undefined;
    set(key: string, value: unknown): void;
    onChange<T>(key: string, handler: (value: T | undefined) => void): PluginDisposable;
  };
  storage: {
    get<T>(key: string): T | undefined;
    set(key: string, value: unknown): void;
  };
}

export interface CommandExecutionContext {
  activateView(viewId: string): void;
  executeCommand(commandId: string, ...args: unknown[]): Promise<unknown>;
  api: PluginHostAPI;
}

export type BuiltinCommandHandler = (
  context: CommandExecutionContext,
  ...args: unknown[]
) => Promise<unknown> | unknown;

export interface BuiltinPluginModule {
  commands?: Record<string, BuiltinCommandHandler>;
  activate?: (api: PluginHostAPI) => Promise<void> | void;
  deactivate?: (api: PluginHostAPI) => Promise<void> | void;
}
