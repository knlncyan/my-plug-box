import type { BuiltinPluginManifest } from '../../domain/protocol/plugin-catalog.protocol';

/**
 * 读取 manifest 的 activationEvents，缺失时返回空数组。
 */
function eventsOf(manifest: BuiltinPluginManifest): string[] {
    return manifest.activationEvents ?? [];
}

/**
 * 是否应在应用启动时激活。
 */
export function shouldActivateOnStartup(manifest: BuiltinPluginManifest): boolean {
    const events = eventsOf(manifest);
    return events.length === 0 || events.includes('onStartup');
}

/**
 * 是否允许通过指定命令触发激活。
 */
export function shouldActivateForCommand(
    manifest: BuiltinPluginManifest,
    commandId: string
): boolean {
    const events = eventsOf(manifest);
    if (events.length === 0) return true;
    return (
        events.includes(`onCommand:${commandId}`) ||
        events.includes('onCommand:*') ||
        events.includes('onCommand')
    );
}

/**
 * 是否允许通过指定视图触发激活。
 */
export function shouldActivateForView(
    manifest: BuiltinPluginManifest,
): boolean {
    const events = eventsOf(manifest);
    if (events.length === 0) return true;
    return (
        events.includes(`onView:${manifest.view?.id}`) ||
        events.includes('onView:*') ||
        events.includes('onView')
    );
}
