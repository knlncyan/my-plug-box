/**
 * Built-in welcome plugin module.
 * Provides frontend command handlers that complement backend metadata.
 */
import type { BuiltinPluginModule } from '../../core/plugin-protocol';

const plugin: BuiltinPluginModule = {
  commands: {
    'welcome.open': (context) => {
      context.activateView('welcome.main');
    },
  },
};

export default plugin;
