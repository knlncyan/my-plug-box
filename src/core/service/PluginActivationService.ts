import { listen, type Event } from '@tauri-apps/api/event';
import service from '../../api/plugin.service';
import type { RustPluginStatus } from '../../domain/plugin';
import type { PluginManifest, PluginSummary } from '../../domain/protocol/plugin-catalog.protocol';
import { PluginDisposable } from '../PluginDisposable';
import { PluginAssetCatalogService } from './PluginAssetCatalogService';
import {
    shouldActivateForCommand,
    shouldActivateForView,
    shouldActivateOnStartup,
} from '../utils/activateEventsUtils';

/**
 * 插件激活状态服务：
 * 1) 管理 manifest 激活规则与 view/command 对应关系。
 * 2) 监听后端事件，保持前后端状态一致。
 * 3) 负责按需触发 rust 端激活。
 */
export class PluginActivationService {
    private readonly activatedPlugins = new Map<string, PluginManifest>();
    private statusChangeListener: (() => void) | null = null;

    constructor(
        private readonly pluginAssetCatalogService: PluginAssetCatalogService,
        private readonly pluginDisposable: PluginDisposable
    ) {}

    /**
     * 启动状态监听。
     */
    async start(): Promise<void> {
        if (this.statusChangeListener) return;

        const unlisten = await listen('plugin-status-changed', (event: Event<RustPluginStatus>) => {
            const { id, status } = event.payload;
            if (status === 'activated') {
                const manifest = this.pluginAssetCatalogService.getManifestById(id);
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

    syncFromPluginList(plugins: PluginSummary[]): void {
        const nextActivated = new Set(
            plugins.filter((plugin) => /^activated$/i.test(plugin.status)).map((plugin) => plugin.id)
        );

        for (const id of Array.from(this.activatedPlugins.keys())) {
            if (!nextActivated.has(id)) {
                this.activatedPlugins.delete(id);
            }
        }

        for (const id of nextActivated) {
            const manifest = this.pluginAssetCatalogService.getManifestById(id);
            if (manifest) {
                this.activatedPlugins.set(id, manifest);
            }
        }
    }

    isPluginActivated(pluginId: string): boolean {
        return this.activatedPlugins.has(pluginId);
    }

    resolvePluginId(target: string): string | null {
        if (this.pluginAssetCatalogService.getManifestById(target)) {
            return target;
        }
        const viewManifest = this.pluginAssetCatalogService.getManifestByViewId(target);
        return viewManifest?.id ?? null;
    }

    canActivateForCommand(pluginId: string, commandId: string): boolean {
        const manifest = this.pluginAssetCatalogService.getManifestById(pluginId);
        if (!manifest) return false;
        return shouldActivateForCommand(manifest, commandId) || shouldActivateOnStartup(manifest);
    }

    canActivateForView(target: string): boolean {
        const pluginId = this.resolvePluginId(target);
        if (!pluginId) return false;
        const manifest = this.pluginAssetCatalogService.getManifestById(pluginId);
        if (!manifest) return false;
        return shouldActivateForView(manifest) || shouldActivateOnStartup(manifest);
    }

    async activatePluginWithHooks(pluginId: string): Promise<void> {
        if (this.isPluginActivated(pluginId)) return;

        const manifest = this.pluginAssetCatalogService.getManifestById(pluginId);
        if (!manifest) {
            throw new Error(`Plugin not found: ${pluginId}`);
        }

        await service.activatePlugin(pluginId);
        this.activatedPlugins.set(pluginId, manifest);
    }
}
