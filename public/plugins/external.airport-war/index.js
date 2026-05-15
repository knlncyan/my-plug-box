const pluginId = 'external.airport-war';

const plugin = {
  pluginId,
  commands: {
    'external.airport-war.open': (context) => {
      context.api.get('views').activate('external.airport-war.main');
      return pluginId;
    },
  },
};

export default plugin;
