const pluginId = 'external.airplane-battle';

const plugin = {
  pluginId,
  commands: {
    'external.airplane-battle.open': (context) => {
      context.api.get('views').activate('external.airplane-battle.main');
      return pluginId;
    },
  },
};

export default plugin;
