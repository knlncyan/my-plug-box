import shortcutService from '@/api/shortcut.service';
import type { CommandMeta } from '../../domain/protocol/plugin-entity.protocol';
import { PluginDisposable } from '../PluginDisposable';
import { ShortcutUpdateDTO } from '@/domain/protocol';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getShortcutCapturing, setCapturedShortcut } from '@/store/shortcutCaptureStore';

type CommandExecutor = (commandId: string) => Promise<unknown>;
type Handler = () => void;

const SHORTCUT_EVENT = 'shortcut-triggered';

interface CommandShortcutServiceDeps {
    pluginDisposable: PluginDisposable;
}

export class CommandShortcutService {
    private started = false;
    private commandExecutor: CommandExecutor | null = null;
    private version = 0;

    private readonly systemCommandHandlerMap = new Map<string, Handler>();
    private readonly systemCommandMap = new Map<string, CommandMeta>();
    private readonly pluginCommandMap = new Map<string, CommandMeta>();
    private readonly listeners = new Set<Handler>();

    constructor(private readonly deps: CommandShortcutServiceDeps) { }

    init(executor: CommandExecutor): void {
        this.commandExecutor = executor;
    }

    async start(): Promise<void> {
        if (this.started) return;
        this.started = true;
        await this.loadShortcutInfo();
        await this.bindShortcutListener();
    }

    refresh = async () => {
        await this.loadShortcutInfo();
    }

    subscribe = (listener: Handler): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    getVersion = (): number => this.version;

    // 执行器，可以执行系统命令
    executeSystemAndPluginCommand = (id: string) => {
        const handler = this.systemCommandHandlerMap.get(id);
        if (handler) {
            handler();
        } else {
            if (!this.pluginCommandMap.has(id)) {
                console.warn(`[Keybinding] received unknown command from global shortcut: ${id}`);
                return;
            }
            if (!this.commandExecutor) {
                console.warn(`[Keybinding] command executor is not configured: ${id}`);
                return;
            }

            void this.commandExecutor(id).catch((error) => {
                console.error(`[Keybinding] global shortcut execution failed: ${id}`, error);
            });
        }
    }

    // 拿到所有快捷键绑定信息
    getCommandsWithShortcut = () => {
        return {
            system: Array.from(this.systemCommandMap?.values() ?? []),
            commands: Array.from(this.pluginCommandMap?.values() ?? [])
        }
    }

    // 注册系统内部的快捷键
    registerSystemCommandHander = (id: string, handler: Handler) => {
        if (!this.systemCommandHandlerMap.has(id)) {
            this.systemCommandHandlerMap.set(id, handler);
        }
    }

    // 更新快捷键绑定，并更新缓存数据
    updateShortcutBinding = async (dto: ShortcutUpdateDTO) => {
        const result = (await shortcutService.updateShortcut(dto)).data;

        if (result) {
            const targetMap = dto.category === 'system'
                ? this.systemCommandMap
                : this.pluginCommandMap;

            if (targetMap.has(result.id)) {
                targetMap.set(result.id, result);
            }
            this.bumpVersion();
        }
    }

    // 重置快捷键绑定，并更新缓存数据
    resetShortcutBinding = async (dto: ShortcutUpdateDTO) => {
        const result = (await shortcutService.resetShortcut(dto)).data;

        if (result) {
            const targetMap = dto.category === 'system'
                ? this.systemCommandMap
                : this.pluginCommandMap;

            if (targetMap.has(result.id)) {
                targetMap.set(result.id, result);
            }
            this.bumpVersion();
        }
    }


    private async loadShortcutInfo() {
        const shortcutManagerMap = (await shortcutService.getShortcutList()).data;
        // 清理所有旧缓存
        this.systemCommandMap.clear();
        this.pluginCommandMap.clear();
        // 存储系统和插件的默认设置
        shortcutManagerMap?.command.forEach(it => this.pluginCommandMap.set(it.id, it));
        shortcutManagerMap?.system.forEach(it => this.systemCommandMap.set(it.id, it));
        shortcutManagerMap?.user.forEach(it => {
            // 这里取巧了，系统命令默认的pluginId为system
            const category = it.pluginId;
            if (category == 'system') {
                this.systemCommandMap.set(it.id, it);
            } else {
                this.pluginCommandMap.set(it.id, it);
            }
        })
        this.bumpVersion();
    }

    private bumpVersion() {
        this.version += 1;
        for (const listener of this.listeners) {
            listener();
        }
    }

    private async bindShortcutListener(): Promise<void> {
        try {
            const shortcutUnlisten = await listen<CommandMeta>(
                SHORTCUT_EVENT,
                async (event) => {
                    const appWindow = getCurrentWindow();
                    const payload = event.payload;
                    if (!payload || typeof payload.id !== 'string') {
                        return;
                    }

                    const commandId = payload.id;
                    const scope = payload.shortcutScope;
                    const isFocused = await appWindow.isFocused();

                    if (scope != 'global' && !isFocused) {
                        return;
                    }
                    if (getShortcutCapturing()) {
                        setCapturedShortcut(payload);
                        return;
                    }

                    this.executeSystemAndPluginCommand(commandId);
                }
            );
            this.deps.pluginDisposable.add('__global__', () => {
                shortcutUnlisten();
                this.systemCommandHandlerMap.clear();
                this.pluginCommandMap.clear();
                this.systemCommandMap.clear();
            });
        } catch (error) {
            console.warn('[Keybinding] bind global shortcut event failed:', error);
        }
    }
}
