import type { Plugin, PluginAPI } from '../../core/types';
import { WelcomeView } from './WelcomeView';

export const welcomePlugin: Plugin = {
  activate(api: PluginAPI) {
    // Register the main view
    api.views.register('welcome.mainView', WelcomeView);

    // Register the command — focuses the welcome view via an event
    api.commands.register('welcome.open', () => {
      api.events.emit('view.focus', { viewId: 'welcome.mainView' });
    });

    // Contribute a menu item to the menu bar
    api.menus.addItem('menubar', { command: 'welcome.open', group: 'help' });
  },
};
