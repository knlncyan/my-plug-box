/**
 * Built-in command palette plugin module.
 * Demonstrates startup/command/view activation hooks and provides command handlers.
 */
import type { PluginModule } from '../../domain/protocol/plugin-runtime.protocol';

let verboseSettingWatcher: { dispose(): void } | null = null;

function printHookNotes(): void {
    console.info('[command-palette] activation hook notes:');
    console.info(' - onStartup: plugin is activated during application bootstrap.');
    console.info(' - onCommand:<commandId> / onCommand:*: plugin can be activated before command execution.');
    console.info(' - onView:<viewId> / onView:*: plugin can be activated when a target view is focused.');
}

const plugin: PluginModule = {
    pluginId: 'builtin.command-palette',
    activate: async (api) => {
        const storage = api.get('storage');
        const events = api.get('events');
        const settings = api.get('settings');
        const launchCount = ((await storage.get<number>('launch_count')) ?? 0) + 1;
        await storage.set('launch_count', launchCount);
        events.emit('builtin.command-palette.activated', { launchCount });
        console.info(`[command-palette] frontend module activated. launch_count=${launchCount}`);
        printHookNotes();

        verboseSettingWatcher?.dispose();
        verboseSettingWatcher = settings.onChange<boolean>('verbose', (value) => {
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
            const views = context.api.get('views');
            views.activate('commandPalette.main');
        },
        'commandPalette.openWelcomeViaCommand': async (context) => {
            console.info('[command-palette] executing cross-plugin command: welcome.open');
            const commands = context.api.get('commands');
            return commands.execute('welcome.open');
        },
        'commandPalette.explainHooks': () => {
            printHookNotes();
            return 'Activation hook notes printed in console.';
        },
        'commandPalette.toggleVerbose': async (context) => {
            const settings = context.api.get('settings');
            const current = (await settings.get<boolean>('verbose')) ?? false;
            const next = !current;
            await settings.set('verbose', next);
            return `command-palette verbose = ${String(next)}`;
        },
    },
};

export default plugin;

