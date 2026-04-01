import type { PluginModule } from '@modudesk/plugin-sdk';

const pluginId = 'external.demo-vue';

const plugin: PluginModule = {
  pluginId,
  activate: async () => {
    console.info('[external.demo-vue] activated');
  },
  commands: {
    'external.demo-vue.open': (context) => {
      context.api.get('views').activate('external.demo-vue.main');
      return null;
    },
    'external.demo-vue.ping': () => {
      return 'pong';
    },
  },
};

export default plugin;

