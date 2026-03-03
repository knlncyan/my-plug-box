/**
 * 每插件一个 Worker 的前端沙箱管理器。
 * 目标：
 * 1) 插件模块（activate/deactivate/commands）在各自 Worker 内执行，互相隔离。
 * 2) 插件仍可通过宿主桥接调用命令、视图、事件、设置、存储能力。
 */
import type { PluginApiRegistry } from './pluginRuntime.api';
import type {
  HostEventMessage,
  HostRequestAction,
  HostRequestMessage,
  HostResponseMessage,
  WorkerRequestMessage,
  WorkerResponseMessage,
} from './pluginWorker.protocol';

interface PluginWorkerSandboxDeps {
  hostApiRegistry: PluginApiRegistry;
  executeCommandFromPlugin: (
    callerPluginId: string,
    commandId: string,
    trace: string[],
    ...args: unknown[]
  ) => Promise<unknown>;
  setActiveView: (viewId: string) => void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

interface PluginWorkerRecord {
  pluginId: string;
  worker: Worker;
  active: boolean;
  pendingRequests: Map<string, PendingRequest>;
  subscriptions: Map<string, () => void>;
}

/**
 * 将 unknown 错误统一转成可读字符串。
 */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class PluginWorkerSandbox {
  private readonly workers = new Map<string, PluginWorkerRecord>();
  private requestSerial = 0;

  /**
   * 注入运行依赖：宿主 API 注册器、命令转发器、视图切换器。
   */
  constructor(private readonly deps: PluginWorkerSandboxDeps) { }

  /**
   * 激活指定插件的 Worker 模块（调用 Worker 侧 activate）。
   */
  async activate(pluginId: string): Promise<void> {
    const record = await this.ensureWorker(pluginId);
    if (record.active) return;
    await this.callWorker(record, 'activate');
    record.active = true;
  }

  /**
   * 停用并销毁指定插件 Worker，释放其事件/设置订阅资源。
   */
  async deactivate(pluginId: string): Promise<void> {
    const record = this.workers.get(pluginId);
    if (!record) {
      this.deps.hostApiRegistry.disposePluginResources(pluginId);
      return;
    }

    try {
      if (record.active) {
        await this.callWorker(record, 'deactivate');
      }
    } finally {
      this.disposeWorker(pluginId);
    }
  }

  /**
   * 把命令转发到目标插件 Worker 执行。
   */
  async executeCommand(
    pluginId: string,
    commandId: string,
    args: unknown[],
    trace: string[]
  ): Promise<unknown> {
    const record = await this.ensureWorker(pluginId);
    return this.callWorker(record, 'execute', { commandId, args, trace });
  }

  /**
   * 销毁所有插件 Worker（通常用于运行时整体释放）。
   */
  disposeAll(): void {
    for (const pluginId of [...this.workers.keys()]) {
      this.disposeWorker(pluginId);
    }
  }

  /**
   * 确保插件 Worker 已就绪：不存在则创建并执行 init 握手。
   */
  private async ensureWorker(pluginId: string): Promise<PluginWorkerRecord> {
    const existing = this.workers.get(pluginId);
    if (existing) return existing;

    const worker = new Worker(new URL('./plugin.worker.ts', import.meta.url), {
      type: 'module',
    });

    const record: PluginWorkerRecord = {
      pluginId,
      worker,
      active: false,
      pendingRequests: new Map(),
      subscriptions: new Map(),
    };

    worker.onmessage = (event: MessageEvent<unknown>) => {
      this.handleWorkerMessage(record, event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      console.error(`[plugin-worker] worker error: ${pluginId}`, event.error ?? event.message);
    };

    this.workers.set(pluginId, record);

    try {
      const [settingsSnapshot, storageSnapshot] = await Promise.all([
        this.deps.hostApiRegistry.getPluginSettingsSnapshot(pluginId),
        this.deps.hostApiRegistry.getPluginStorageSnapshot(pluginId),
      ]);

      await this.callWorker(record, 'init', {
        pluginId,
        settings: settingsSnapshot,
        storage: storageSnapshot,
      });
      return record;
    } catch (error) {
      this.disposeWorker(pluginId);
      throw error;
    }
  }

  /**
   * 统一分发 Worker 发来的消息（host-response / worker-request）。
   */
  private handleWorkerMessage(record: PluginWorkerRecord, raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;

    const message = raw as { type?: unknown };
    if (message.type === 'host-response') {
      this.handleHostResponse(record, raw as HostResponseMessage);
      return;
    }
    if (message.type === 'worker-request') {
      void this.handleWorkerRequest(record, raw as WorkerRequestMessage);
    }
  }

  /**
   * 处理 Worker 对主线程请求的响应，完成 Promise 回调。
   */
  private handleHostResponse(record: PluginWorkerRecord, message: HostResponseMessage): void {
    const pending = record.pendingRequests.get(message.requestId);
    if (!pending) return;

    record.pendingRequests.delete(message.requestId);
    if (message.success) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error ?? 'worker request failed'));
    }
  }

  /**
   * 处理 Worker 主动请求宿主能力的调用。
   */
  private async handleWorkerRequest(
    record: PluginWorkerRecord,
    message: WorkerRequestMessage
  ): Promise<void> {
    try {
      const result = await this.dispatchWorkerRequest(record, message);
      this.postWorkerResponse(record.worker, {
        type: 'worker-response',
        requestId: message.requestId,
        success: true,
        result,
      });
    } catch (error) {
      this.postWorkerResponse(record.worker, {
        type: 'worker-response',
        requestId: message.requestId,
        success: false,
        error: toErrorMessage(error),
      });
    }
  }

  /**
   * 执行 Worker 请求的具体动作（命令、视图、事件、设置、存储）。
   */
  private async dispatchWorkerRequest(
    record: PluginWorkerRecord,
    message: WorkerRequestMessage
  ): Promise<unknown> {
    const payload = this.asRecord(message.payload);
    const api = this.deps.hostApiRegistry.getOrCreate(record.pluginId);

    switch (message.action) {
      case 'commands.execute': {
        const commandId = this.readString(payload, 'commandId');
        const args = this.readArray(payload, 'args');
        const trace = this.readStringArray(payload, 'trace');
        return this.deps.executeCommandFromPlugin(record.pluginId, commandId, trace, ...args);
      }
      case 'views.activate': {
        const viewId = this.readString(payload, 'viewId');
        this.deps.setActiveView(viewId);
        return null;
      }
      case 'events.emit': {
        const event = this.readString(payload, 'event');
        api.events.emit(event, payload.payload);
        return null;
      }
      case 'events.on': {
        const event = this.readString(payload, 'event');
        const subscriptionId = this.readString(payload, 'subscriptionId');
        this.releaseSubscription(record, subscriptionId);

        const disposable = api.events.on(event, (eventPayload) => {
          this.postHostEvent(record.worker, {
            type: 'host-event',
            subscriptionId,
            payload: eventPayload,
          });
        });
        this.bindSubscription(record, subscriptionId, () => disposable.dispose());
        return null;
      }
      case 'events.off': {
        const subscriptionId = this.readString(payload, 'subscriptionId');
        this.releaseSubscription(record, subscriptionId);
        return null;
      }
      case 'settings.get': {
        const key = this.readString(payload, 'key');
        return api.settings.get(key);
      }
      case 'settings.set': {
        const key = this.readString(payload, 'key');
        api.settings.set(key, payload.value);
        return null;
      }
      case 'settings.onChange': {
        const key = this.readString(payload, 'key');
        const subscriptionId = this.readString(payload, 'subscriptionId');
        this.releaseSubscription(record, subscriptionId);

        const disposable = api.settings.onChange(key, (value) => {
          this.postHostEvent(record.worker, {
            type: 'host-event',
            subscriptionId,
            payload: value,
          });
        });
        this.bindSubscription(record, subscriptionId, () => disposable.dispose());
        return null;
      }
      case 'settings.offChange': {
        const subscriptionId = this.readString(payload, 'subscriptionId');
        this.releaseSubscription(record, subscriptionId);
        return null;
      }
      case 'storage.get': {
        const key = this.readString(payload, 'key');
        return api.storage.get(key);
      }
      case 'storage.set': {
        const key = this.readString(payload, 'key');
        api.storage.set(key, payload.value);
        return null;
      }
      default:
        throw new Error(`unsupported worker action: ${message.action}`);
    }
  }

  /**
   * 主线程向 Worker 发起请求，并等待异步响应。
   */
  private callWorker(
    record: PluginWorkerRecord,
    action: HostRequestAction,
    payload?: unknown
  ): Promise<unknown> {
    const requestId = this.nextRequestId(record.pluginId);

    return new Promise((resolve, reject) => {
      record.pendingRequests.set(requestId, { resolve, reject });
      const message: HostRequestMessage = {
        type: 'host-request',
        requestId,
        action,
        payload,
      };
      record.worker.postMessage(message);
    });
  }

  /**
   * 建立 subscriptionId 与宿主取消函数的绑定。
   */
  private bindSubscription(
    record: PluginWorkerRecord,
    subscriptionId: string,
    dispose: () => void
  ): void {
    this.releaseSubscription(record, subscriptionId);
    record.subscriptions.set(subscriptionId, dispose);
  }

  /**
   * 释放单个订阅并调用其 dispose。
   */
  private releaseSubscription(record: PluginWorkerRecord, subscriptionId: string): void {
    const dispose = record.subscriptions.get(subscriptionId);
    if (!dispose) return;

    record.subscriptions.delete(subscriptionId);
    try {
      dispose();
    } catch (error) {
      console.error(
        `[plugin-worker] failed to dispose subscription: ${record.pluginId}#${subscriptionId}`,
        error
      );
    }
  }

  /**
   * 释放插件 Worker 关联的全部订阅。
   */
  private releaseAllSubscriptions(record: PluginWorkerRecord): void {
    for (const subscriptionId of [...record.subscriptions.keys()]) {
      this.releaseSubscription(record, subscriptionId);
    }
  }

  /**
   * 销毁 Worker 记录：取消订阅、拒绝挂起请求、终止 Worker。
   */
  private disposeWorker(pluginId: string): void {
    const record = this.workers.get(pluginId);
    if (!record) return;

    this.releaseAllSubscriptions(record);
    this.deps.hostApiRegistry.disposePluginResources(pluginId);

    const disposeError = new Error(`plugin worker disposed: ${pluginId}`);
    for (const pending of record.pendingRequests.values()) {
      pending.reject(disposeError);
    }
    record.pendingRequests.clear();

    record.worker.terminate();
    this.workers.delete(pluginId);
  }

  /**
   * 向 Worker 回写 worker-response。
   */
  private postWorkerResponse(worker: Worker, message: WorkerResponseMessage): void {
    worker.postMessage(message);
  }

  /**
   * 向 Worker 推送宿主事件回调数据。
   */
  private postHostEvent(worker: Worker, message: HostEventMessage): void {
    worker.postMessage(message);
  }

  /**
   * 生成主线程 -> Worker 请求 ID。
   */
  private nextRequestId(pluginId: string): string {
    this.requestSerial += 1;
    return `${pluginId}:${this.requestSerial}`;
  }

  /**
   * 将未知值安全转换为对象，非对象时返回空对象。
   */
  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') {
      return {};
    }
    return value as Record<string, unknown>;
  }

  /**
   * 读取 payload 的必填字符串字段。
   */
  private readString(record: Record<string, unknown>, key: string): string {
    const value = record[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`worker request field "${key}" must be a non-empty string`);
    }
    return value;
  }

  /**
   * 读取 payload 的数组字段，缺失时返回空数组。
   */
  private readArray(record: Record<string, unknown>, key: string): unknown[] {
    const value = record[key];
    if (!Array.isArray(value)) return [];
    return value;
  }

  /**
   * 读取并过滤字符串数组字段。
   */
  private readStringArray(record: Record<string, unknown>, key: string): string[] {
    const value = record[key];
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
  }
}
