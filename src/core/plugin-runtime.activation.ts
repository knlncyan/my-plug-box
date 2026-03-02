/**
 * Activation policy helpers for plugin runtime.
 */
import type { BuiltinPluginManifest } from './plugin-protocol';

function eventsOf(manifest: BuiltinPluginManifest): string[] {
  return manifest.activationEvents ?? [];
}

export function shouldActivateOnStartup(manifest: BuiltinPluginManifest): boolean {
  const events = eventsOf(manifest);
  return events.length === 0 || events.includes('onStartup');
}

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

export function shouldActivateForView(
  manifest: BuiltinPluginManifest,
  viewId: string
): boolean {
  const events = eventsOf(manifest);
  if (events.length === 0) return true;
  return (
    events.includes(`onView:${viewId}`) ||
    events.includes('onView:*') ||
    events.includes('onView')
  );
}
