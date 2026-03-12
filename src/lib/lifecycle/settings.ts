/**
 * 系统设置或自定义设置的持久化和加载
 */

import lifecycleTrigger from "../lifecycleTrigger"
import { useAsideStateStore } from "@/store/asideStateStore";


lifecycleTrigger.register(async () => {
    await useAsideStateStore.getState().hydrate();
}, 'init');

lifecycleTrigger.register(async () => {
    await useAsideStateStore.getState().persist();
}, 'shutdown');