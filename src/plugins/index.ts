/**
 * Built-in plugin registry.
 *
 * To add a new built-in plugin:
 *   1. Create a directory under src/plugins/<your-plugin>/
 *   2. Add a plugin.json manifest
 *   3. Export a Plugin object from index.ts
 *   4. Import and register it here
 *
 * To load an external (runtime) plugin use PluginManager + PluginBridge directly.
 */

import type { PluginManager } from '../core/plugin-manager';
import type { PluginManifest } from '../core/types';

import welcomeManifestJson from './welcome/plugin.json';
import { welcomePlugin } from './welcome/index';

import commandPaletteManifestJson from './command-palette/plugin.json';
import { commandPalettePlugin } from './command-palette/index';

const welcomeManifest = welcomeManifestJson as PluginManifest;
const commandPaletteManifest = commandPaletteManifestJson as PluginManifest;

export function registerBuiltinPlugins(manager: PluginManager): void {
  manager.registerBuiltin(welcomeManifest, welcomePlugin);
  manager.registerBuiltin(commandPaletteManifest, commandPalettePlugin);
}
