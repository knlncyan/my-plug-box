/**
 * Built-in welcome plugin module.
 * Provides frontend command handlers that complement backend metadata.
 */
import type { BuiltinPluginModule } from '../../domain/protocol/plugin-runtime.protocol';

const plugin: BuiltinPluginModule = {
  pluginId: 'builtin.welcome',
  commands: {
    'welcome.open': (context) => {
      const views = context.api.get('views');
      views.activate('welcome.main');
    },
  },
};

export default plugin;
