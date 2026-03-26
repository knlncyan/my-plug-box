import type { PluginModule } from '@plug-box/plugin-sdk';

const pluginId = 'external.demo-vue';

const plugin: PluginModule = {
  pluginId,
  activate: async () => {
    console.info('[external.demo-vue] activated');
  },
  commands: {
    'external.demo-vue.open': (context) => {
      context.api.get('views').activate('external.demo-vue.main');
      return pluginId;
    },
    'external.demo-vue.ping': () => {
      return 'pong';
    },
  },
};

export default plugin;
