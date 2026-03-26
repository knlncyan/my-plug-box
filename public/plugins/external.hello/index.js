const plugin = {
  pluginId: 'external.hello',
  activate: async (api) => {
    const storage = api.get('storage');
    const launchCount = ((await storage.get('launch_count')) ?? 0) + 1;
    await storage.set('launch_count', launchCount);
    console.info(`[external.hello] activated, launch_count=${launchCount}`);
  },
  deactivate: () => {
    console.info('[external.hello] deactivated');
  },
  commands: {
    'external.hello.open': (context) => {
      const views = context.api.get('views');
      views.activate('external.hello.main');
      return 'external.hello';
    },
    'external.hello.ping': () => {
      console.info('[external.hello] pong');
      return 'pong';
    },
  },
};

export default plugin;
