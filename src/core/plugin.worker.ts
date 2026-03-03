/**
 * 插件 Worker 入口。
 * 每个 Worker 只承载一个插件模块，负责：
 * 1) 执行 activate/deactivate/command handler
 * 2) 通过消息桥接调用宿主能力（命令、视图、事件、设置、存储）
 */
import type {
  BuiltinPluginModule,
  CommandExecutionContext,
  PluginDisposable,
  PluginHostAPI,
} from './pluginRuntime.protocol';
import type {
  HostEventMessage,
  HostRequestMessage,
  HostResponseMessage,
  MessageFromHost,
  WorkerRequestAction,
  WorkerRequestMessage,
  WorkerResponseMessage,
} from './pluginWorker.protocol';

const pluginModuleLoaders = import.meta.glob('../plugins/*/index.ts');

interface PendingHostResponse {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

let pluginId = '';
let pluginModule: BuiltinPluginModule | null = null;
let activated = false;
let requestSerial = 0;

// settings 快照缓存，保证 settings.get 可以同步读取。
let settingsCache: Record<string, unknown> = {};
// storage 快照缓存，保证 storage.get 可以同步读取。
let storageCache: Record<string, unknown> = {};

const pendingHostResponses = new Map<string, PendingHostResponse>();
const subscriptionHandlers = new Map<string, (payload: unknown) => void>();
const settingSubscriptionKeys = new Map<string, string>();
const lifecycleDisposables = new Set<PluginDisposable>();

/**
 * 将未知错误转换成字符串，便于跨线程传输。
 */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 安全地把 unknown 转为对象。
 */
function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

/**
 * 生成 Worker -> Host 的请求 ID。
 */
function nextRequestId(prefix: string): string {
  requestSerial += 1;
  return `${prefix}:${requestSerial}`;
}

/**
 * Worker 调用宿主能力的统一入口。
 */
function requestHost(action: WorkerRequestAction, payload?: unknown): Promise<unknown> {
  const requestId = nextRequestId('worker');
  const message: WorkerRequestMessage = {
    type: 'worker-request',
    requestId,
    action,
    payload,
  };

  return new Promise((resolve, reject) => {
    pendingHostResponses.set(requestId, { resolve, reject });
    self.postMessage(message);
  });
}

/**
 * 回写 host-response 给主线程。
 */
function postHostResponse(message: HostResponseMessage): void {
  self.postMessage(message);
}

/**
 * 跟踪插件生命周期内创建的 disposable，便于统一清理。
 */
function trackDisposable(disposable: PluginDisposable): PluginDisposable {
  let disposed = false;
  const wrapped: PluginDisposable = {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      lifecycleDisposables.delete(wrapped);
      disposable.dispose();
    },
  };

  lifecycleDisposables.add(wrapped);
  return wrapped;
}

/**
 * 清理当前插件 Worker 内所有生命周期资源。
 */
function cleanupLifecycleDisposables(): void {
  for (const disposable of [...lifecycleDisposables]) {
    disposable.dispose();
  }
}

/**
 * 释放 Worker 侧订阅，并通知主线程解绑。
 */
function disposeSubscription(
  subscriptionId: string,
  action: 'events.off' | 'settings.offChange'
): void {
  subscriptionHandlers.delete(subscriptionId);
  settingSubscriptionKeys.delete(subscriptionId);
  void requestHost(action, { subscriptionId });
}

/**
 * 创建插件可见的 Host API 代理（命令/视图/事件/设置/存储）。
 */
function createScopedHostApi(trace: string[]): PluginHostAPI {
  return {
    pluginId,
    commands: {
      execute: (commandId: string, ...args: unknown[]) =>
        requestHost('commands.execute', { commandId, args, trace }),
    },
    views: {
      activate: (viewId: string) => {
        void requestHost('views.activate', { viewId });
      },
    },
    events: {
      emit: (event: string, payload?: unknown) => {
        void requestHost('events.emit', { event, payload });
      },
      on: (event: string, handler: (payload: unknown) => void) => {
        const subscriptionId = nextRequestId('event');
        subscriptionHandlers.set(subscriptionId, handler);

        void requestHost('events.on', { event, subscriptionId }).catch((error) => {
          subscriptionHandlers.delete(subscriptionId);
          console.error(`[plugin-worker] failed to register event listener: ${event}`, error);
        });

        return trackDisposable({
          dispose: () => {
            disposeSubscription(subscriptionId, 'events.off');
          },
        });
      },
    },
    settings: {
      get: <T>(key: string): T | undefined => settingsCache[key] as T | undefined,
      set: (key: string, value: unknown) => {
        settingsCache[key] = value;
        void requestHost('settings.set', { key, value });
      },
      onChange: <T>(key: string, handler: (value: T | undefined) => void) => {
        const subscriptionId = nextRequestId('setting');
        settingSubscriptionKeys.set(subscriptionId, key);
        subscriptionHandlers.set(subscriptionId, (payload) => {
          settingsCache[key] = payload;
          handler(payload as T | undefined);
        });

        void requestHost('settings.onChange', { key, subscriptionId }).catch((error) => {
          settingSubscriptionKeys.delete(subscriptionId);
          subscriptionHandlers.delete(subscriptionId);
          console.error(`[plugin-worker] failed to register setting listener: ${key}`, error);
        });

        return trackDisposable({
          dispose: () => {
            disposeSubscription(subscriptionId, 'settings.offChange');
          },
        });
      },
    },
    storage: {
      get: <T>(key: string): T | undefined => storageCache[key] as T | undefined,
      set: (key: string, value: unknown) => {
        storageCache[key] = value;
        void requestHost('storage.set', { key, value });
      },
    },
  };
}

/**
 * 创建命令 handler 的执行上下文。
 */
function createCommandContext(trace: string[]): CommandExecutionContext {
  return {
    activateView: (viewId: string) => {
      void requestHost('views.activate', { viewId });
    },
    executeCommand: (commandId: string, ...args: unknown[]) =>
      requestHost('commands.execute', { commandId, args, trace }),
    api: createScopedHostApi(trace),
  };
}

/**
 * 根据插件 ID 动态加载对应 index.ts 模块。
 */
async function loadPluginModuleById(targetPluginId: string): Promise<BuiltinPluginModule | null> {
  const folder = targetPluginId.replace(/^builtin\./, '');
  const moduleKey = `../plugins/${folder}/index.ts`;
  const loader = pluginModuleLoaders[moduleKey];

  if (!loader) {
    return null;
  }

  const loaded = (await loader()) as { default?: BuiltinPluginModule };
  return loaded.default ?? null;
}

/**
 * 处理主线程对 Worker 请求的回包，兑现 Promise。
 */
function resolveWorkerResponse(message: WorkerResponseMessage): void {
  const pending = pendingHostResponses.get(message.requestId);
  if (!pending) return;

  pendingHostResponses.delete(message.requestId);
  if (message.success) {
    pending.resolve(message.result);
  } else {
    pending.reject(new Error(message.error ?? 'host request failed'));
  }
}

/**
 * 分发主线程推送的订阅事件。
 */
function dispatchHostEvent(message: HostEventMessage): void {
  const handler = subscriptionHandlers.get(message.subscriptionId);
  if (!handler) return;

  try {
    handler(message.payload);
  } catch (error) {
    console.error(`[plugin-worker] subscription callback error: ${message.subscriptionId}`, error);
  }
}

/**
 * 处理主线程下发给 Worker 的动作请求（init/activate/deactivate/execute）。
 */
async function dispatchHostRequest(message: HostRequestMessage): Promise<unknown> {
  const payload = asRecord(message.payload);

  switch (message.action) {
    case 'init': {
      const nextPluginId = payload.pluginId;
      if (typeof nextPluginId !== 'string' || nextPluginId.length === 0) {
        throw new Error('init payload missing pluginId');
      }

      cleanupLifecycleDisposables();
      pluginId = nextPluginId;
      pluginModule = await loadPluginModuleById(pluginId);
      settingsCache = asRecord(payload.settings);
      storageCache = asRecord(payload.storage);
      activated = false;
      return null;
    }
    case 'activate': {
      if (!pluginModule || activated) return null;
      await pluginModule.activate?.(createScopedHostApi([]));
      activated = true;
      return null;
    }
    case 'deactivate': {
      try {
        if (pluginModule && activated) {
          await pluginModule.deactivate?.(createScopedHostApi([]));
        }
      } finally {
        cleanupLifecycleDisposables();
        activated = false;
      }
      return null;
    }
    case 'execute': {
      if (!pluginModule) {
        throw new Error(`plugin module not found: ${pluginId}`);
      }

      const commandId = payload.commandId;
      if (typeof commandId !== 'string' || commandId.length === 0) {
        throw new Error('execute payload missing commandId');
      }

      const args = Array.isArray(payload.args) ? payload.args : [];
      const trace = Array.isArray(payload.trace)
        ? payload.trace.filter((item): item is string => typeof item === 'string')
        : [];

      const command = pluginModule.commands?.[commandId];
      if (!command) {
        throw new Error(`command handler is not implemented in worker: ${commandId}`);
      }

      return command(createCommandContext(trace), ...args);
    }
    default:
      throw new Error(`unsupported host action: ${String(message.action)}`);
  }
}

/**
 * 封装 host-request 处理并回写成功/失败结果。
 */
async function handleHostRequest(message: HostRequestMessage): Promise<void> {
  try {
    const result = await dispatchHostRequest(message);
    postHostResponse({
      type: 'host-response',
      requestId: message.requestId,
      success: true,
      result,
    });
  } catch (error) {
    postHostResponse({
      type: 'host-response',
      requestId: message.requestId,
      success: false,
      error: toErrorMessage(error),
    });
  }
}

/**
 * Worker 消息入口：按消息类型分发处理逻辑。
 */
self.addEventListener('message', (event: MessageEvent<MessageFromHost>) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'host-request') {
    void handleHostRequest(message);
    return;
  }
  if (message.type === 'worker-response') {
    resolveWorkerResponse(message);
    return;
  }
  if (message.type === 'host-event') {
    dispatchHostEvent(message);
  }
});
