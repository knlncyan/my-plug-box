import type { PluginModule } from '@plug-box/plugin-sdk';

const pluginId = 'external.demo-react';

const plugin: PluginModule = {
  pluginId,
  activate: async () => {
    console.info('[external.demo-react] activated');
  },
  commands: {
    'external.demo-react.open': (context) => {
      context.api.get('views').activate('external.demo-react.main');
      return pluginId;
    },
    'external.demo-react.ping': () => {
      return 'pong';
    },
  },
};

export default plugin;
