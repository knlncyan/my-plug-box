/**
 * Built-in command palette plugin module.
 * Demonstrates startup/command/view activation hooks and provides command handlers.
 */
import type { BuiltinPluginModule } from '../../core/plugin-protocol';

let verboseSettingWatcher: { dispose(): void } | null = null;

function printHookNotes(): void {
  console.info('[command-palette] activation hook notes:');
  console.info(' - onStartup: plugin is activated during application bootstrap.');
  console.info(' - onCommand:<commandId> / onCommand:*: plugin can be activated before command execution.');
  console.info(' - onView:<viewId> / onView:*: plugin can be activated when a target view is focused.');
}

const plugin: BuiltinPluginModule = {
  activate: (api) => {
    const launchCount = (api.storage.get<number>('launch_count') ?? 0) + 1;
    api.storage.set('launch_count', launchCount);
    api.events.emit('builtin.command-palette.activated', { launchCount });
    console.info(`[command-palette] frontend module activated. launch_count=${launchCount}`);
    printHookNotes();

    verboseSettingWatcher?.dispose();
    verboseSettingWatcher = api.settings.onChange<boolean>('verbose', (value) => {
      console.info(`[command-palette] setting changed: verbose=${String(value)}`);
    });
  },
  deactivate: () => {
    verboseSettingWatcher?.dispose();
    verboseSettingWatcher = null;
    console.info('[command-palette] frontend module deactivated.');
  },
  commands: {
    'commandPalette.open': (context) => {
      console.info('[command-palette] command "commandPalette.open" executed.');
      context.activateView('commandPalette.main');
    },
    'commandPalette.openWelcomeViaCommand': async (context) => {
      console.info('[command-palette] executing cross-plugin command: welcome.open');
      return context.executeCommand('welcome.open');
    },
    'commandPalette.explainHooks': () => {
      printHookNotes();
      return 'Activation hook notes printed in console.';
    },
    'commandPalette.toggleVerbose': (context) => {
      const current = context.api.settings.get<boolean>('verbose') ?? false;
      const next = !current;
      context.api.settings.set('verbose', next);
      return `command-palette verbose = ${String(next)}`;
    },
  },
};

export default plugin;
