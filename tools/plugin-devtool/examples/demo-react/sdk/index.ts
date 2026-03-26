export interface PluginDisposable {
  dispose(): void;
}

export interface CommandsCapability {
  execute(commandId: string, ...args: unknown[]): Promise<unknown>;
}

export interface ViewsCapability {
  activate(viewId: string): void;
}

export interface EventsCapability {
  emit(event: string, payload?: unknown): void;
  on(event: string, handler: (payload: unknown) => void): PluginDisposable;
}

export interface SettingsCapability {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  onChange<T>(key: string, handler: (value: T | undefined) => void): PluginDisposable;
}

export interface StorageCapability {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

export type PluginCapabilityMap = {
  commands: CommandsCapability;
  views: ViewsCapability;
  events: EventsCapability;
  settings: SettingsCapability;
  storage: StorageCapability;
} & Record<string, Record<string, unknown>>;

export interface PluginHostAPI {
  readonly pluginId: string;
  call<T = unknown>(method: string, params?: unknown): Promise<T>;
  get<K extends string>(id: K): K extends keyof PluginCapabilityMap
    ? PluginCapabilityMap[K]
    : Record<string, unknown>;
}

export interface CommandExecutionContext {
  api: PluginHostAPI;
}

export type PluginCommandHandler = (
  context: CommandExecutionContext,
  ...args: unknown[]
) => Promise<unknown> | unknown;

export interface PluginModule {
  readonly pluginId: string;
  commands?: Record<string, PluginCommandHandler>;
  activate?: (api: PluginHostAPI) => Promise<void> | void;
  deactivate?: (api: PluginHostAPI) => Promise<void> | void;
}

type GlobalWithApiFactory = typeof globalThis & {
  __PLUG_BOX_API_FACTORY__?: () => Promise<PluginHostAPI>;
  __PLUG_BOX_API__?: PluginHostAPI;
};

function isValidApi(value: unknown): value is PluginHostAPI {
  return !!value && typeof value === 'object' &&
    typeof (value as PluginHostAPI).call === 'function' &&
    typeof (value as PluginHostAPI).get === 'function';
}

export async function createPluginApi(seedApi?: unknown): Promise<PluginHostAPI> {
  if (isValidApi(seedApi)) {
    return seedApi;
  }

  const globalScope = globalThis as GlobalWithApiFactory;

  if (typeof globalScope.__PLUG_BOX_API_FACTORY__ === 'function') {
    const api = await globalScope.__PLUG_BOX_API_FACTORY__();
    if (isValidApi(api)) return api;
  }

  if (isValidApi(globalScope.__PLUG_BOX_API__)) {
    return globalScope.__PLUG_BOX_API__;
  }

  throw new Error('[plugin-sdk] Plugin API factory is not available in current runtime');
}

export async function createViewApi(seedApi?: unknown): Promise<PluginHostAPI> {
  return createPluginApi(seedApi);
}
