import type { PluginModule } from '@modudesk-sdk/types';

const pluginId = 'my.plugin';

const plugin: PluginModule = {
  pluginId,
  activate: async () => {
    console.info('[my.plugin] activated');
  },
  commands: {
    'my.plugin.open': (context) => {
      context.api.get('views').activate('my.plugin.main');
      return null;
    },
    'my.plugin.ping': () => {
      return 'pong';
    },
  },
};

export default plugin;
