// PluginActivationService.ts
import { listen, type Event } from '@tauri-apps/api/event';
import service from '../../api/plugin.service';
import type { RustPluginStatus } from '../../domain/plugin';
import type { BuiltinPluginManifest, PluginSummary } from '../../domain/protocol/plugin-catalog.protocol';
import { PluginDisposable } from '../PluginDisposable';
import { getBuiltinPluginManifests } from '../utils/PluginResourceLoader';
import {
    shouldActivateForCommand,
    shouldActivateForView,
    shouldActivateOnStartup,
} from '../utils/activateEventsUtils';

/**
 * 插件激活状态服务：
 * 1) 管理 plugin.json 的激活规则索引。
 * 2) 管理当前已激活插件集合。
 * 3) 监听 Rust 端状态事件，保证前后端状态一致。
 */
export class PluginActivationService {
    private readonly plugins = new Map<string, BuiltinPluginManifest>();
    private readonly activatedPlugins = new Map<string, BuiltinPluginManifest>();
    private statusChangeListener: (() => void) | null = null;

    constructor(private readonly pluginDisposable: PluginDisposable) {
        for (const manifest of getBuiltinPluginManifests()) {
            const pluginId = manifest.id;
            if (this.plugins.has(pluginId)) {
                console.error(`Duplicated plugin id: ${pluginId}`);
                continue;
            }
            this.plugins.set(pluginId, manifest);
        }
    }

    /**
     * 启动状态监听（仅需调用一次）。
     */
    async start(): Promise<void> {
        if (this.statusChangeListener) return;

        const unlisten = await listen('plugin-status-changed', (event: Event<RustPluginStatus>) => {
            const { id, status } = event.payload;
            if (status === 'activated') {
                const manifest = this.plugins.get(id);
                if (manifest) {
                    this.activatedPlugins.set(id, manifest);
                } else {
                    console.warn(`[PluginActivation] Unknown plugin activated: ${id}`);
                }
            } else if (status === 'inactive' || status === 'error') {
                this.activatedPlugins.delete(id);
            }
        });

        this.statusChangeListener = unlisten;
        this.pluginDisposable.add('__global__', unlisten);
    }

    /**
     * 根据最新插件快照同步激活状态。
     */
    syncFromPluginList(plugins: PluginSummary[]): void {
        const next = new Set(
            plugins
                .filter((plugin) => /^activated$/i.test(plugin.status))
                .map((plugin) => plugin.id)
        );

        for (const id of Array.from(this.activatedPlugins.keys())) {
            if (!next.has(id)) {
                this.activatedPlugins.delete(id);
            }
        }

        for (const id of next) {
            const manifest = this.plugins.get(id);
            if (manifest) {
                this.activatedPlugins.set(id, manifest);
            }
        }
    }

    isPluginActivated(pluginId: string): boolean {
        return this.activatedPlugins.has(pluginId);
    }

    canActivateForCommand(pluginId: string, commandId: string): boolean {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) return false;
        return shouldActivateForCommand(plugin, commandId) || shouldActivateOnStartup(plugin);
    }

    canActivateForView(pluginId: string, viewId: string): boolean {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) return false;
        return shouldActivateForView(plugin, viewId) || shouldActivateOnStartup(plugin);
    }

    /**
     * 激活插件（后端状态激活，前端模块激活由 WorkerSandboxService 负责）。
     */
    async activatePluginWithHooks(pluginId: string): Promise<void> {
        if (this.isPluginActivated(pluginId)) return;

        const manifest = this.plugins.get(pluginId);
        if (!manifest) {
            throw new Error(`Plugin not found: ${pluginId}`);
        }

        await service.activatePlugin(pluginId);
        // 事件回调可能有延迟，先本地标记为激活状态。
        this.activatedPlugins.set(pluginId, manifest);
    }
}
