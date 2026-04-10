import { container } from "@/core";
import lifecycleTrigger from "../lifecycleTrigger"
import { useAsideStateStore } from "@/store/asideStateStore";
import { CommandShortcutService } from "@/core/service/CommandShortcutService";
import { useCommandPaletteDialog } from "@/ui/pages/commandPalette";

const css = container.resolve(CommandShortcutService);

// 设置的初始化加载
lifecycleTrigger.register(async () => {
    await useAsideStateStore.getState().hydrate();
}, 'init');

// 设置的关闭时保存
lifecycleTrigger.register(async () => {
    await useAsideStateStore.getState().persist();
}, 'shutdown');

// 系统快捷键注册
lifecycleTrigger.register(async () => {
    css.registerSystemCommandHander('system-command-pattern.open', () => {
        useCommandPaletteDialog.show();
    });
}, 'init');