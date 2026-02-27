import type { Plugin, PluginAPI } from '../../core/types';

export const commandPalettePlugin: Plugin = {
  activate(api: PluginAPI) {
    // Register the Show All Commands command.
    // The actual UI is rendered by AppShell; this command emits an event
    // that AppShell listens to.
    api.commands.register('workbench.openCommandPalette', () => {
      api.events.emit('workbench.openCommandPalette');
    });
  },
};
