/**
 * Built-in welcome plugin module.
 * Provides frontend command handlers that complement backend metadata.
 */
import type { BuiltinPluginModule } from '../../core/pluginRuntime.protocol';

const plugin: BuiltinPluginModule = {
  pluginId: 'builtin.welcome',
  commands: {
    'welcome.open': (context) => {
      context.activateView('welcome.main');
    },
  },
};

export default plugin;
