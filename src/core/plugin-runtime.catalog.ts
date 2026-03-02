/**
 * Built-in plugin catalog registration and runtime lookup indexes.
 */
import type {
  BuiltinCommandHandler,
  BuiltinPluginManifest,
  BuiltinPluginModule,
} from './plugin-protocol';
import service from './pluginBackend.service';
import { getBuiltinPluginManifests, getBuiltinPluginModule } from '../plugins';
import type { PluginHostApiRegistry } from './plugin-runtime.api';

export interface RuntimeCommandEntry {
  pluginId: string;
  handler: BuiltinCommandHandler;
}

interface PluginRuntimeCatalogDeps {
  hostApiRegistry: PluginHostApiRegistry;
}

export class PluginRuntimeCatalog {
  private initialized = false;
  private readonly manifestsById = new Map<string, BuiltinPluginManifest>();
  private readonly modulesById = new Map<string, BuiltinPluginModule>();
  private readonly commandHandlers = new Map<string, RuntimeCommandEntry>();

  constructor(private readonly deps: PluginRuntimeCatalogDeps) {}

  async registerBuiltins(): Promise<void> {
    if (this.initialized) return;

    for (const manifest of getBuiltinPluginManifests()) {
      this.assertUniquePluginId(manifest.id);
      this.manifestsById.set(manifest.id, manifest);

      const module = getBuiltinPluginModule(manifest.id);
      if (module) this.modulesById.set(manifest.id, module);
      this.registerModuleCommandHandlers(manifest.id, module);

      this.deps.hostApiRegistry.getOrCreate(manifest.id);
      await this.registerManifestToBackend(manifest);
    }

    this.initialized = true;
  }

  getManifest(pluginId: string): BuiltinPluginManifest | undefined {
    return this.manifestsById.get(pluginId);
  }

  getModule(pluginId: string): BuiltinPluginModule | undefined {
    return this.modulesById.get(pluginId);
  }

  getCommandHandler(commandId: string): RuntimeCommandEntry | undefined {
    return this.commandHandlers.get(commandId);
  }

  getAllManifests(): IterableIterator<BuiltinPluginManifest> {
    return this.manifestsById.values();
  }

  private assertUniquePluginId(pluginId: string): void {
    if (this.manifestsById.has(pluginId)) {
      throw new Error(`Duplicated plugin id: ${pluginId}`);
    }
  }

  private registerModuleCommandHandlers(
    pluginId: string,
    module: BuiltinPluginModule | null
  ): void {
    const handlers = module?.commands;
    if (!handlers) return;

    for (const [commandId, handler] of Object.entries(handlers)) {
      if (this.commandHandlers.has(commandId)) {
        throw new Error(`Duplicated command handler id: ${commandId}`);
      }
      this.commandHandlers.set(commandId, { pluginId, handler });
    }
  }

  private async registerManifestToBackend(manifest: BuiltinPluginManifest): Promise<void> {
    await service.registerPlugin({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      activationEvents: manifest.activationEvents ?? [],
    });

    for (const view of manifest.views ?? []) {
      await service.registerView({
        ...view,
        plugin_id: manifest.id,
        props: view.props ?? {},
      });
    }

    for (const command of manifest.commands ?? []) {
      await service.registerCommand({
        ...command,
        plugin_id: manifest.id,
        expose: command.expose ?? false,
      });
    }
  }
}
