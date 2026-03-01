import { useEffect, useRef, useState } from 'react';
import { EventBus } from './core/event-bus';
import { CommandRegistry } from './core/command-registry';
import { ViewRegistry } from './core/view-registry';
import { MenuRegistry } from './core/menu-registry';
import { SettingsRegistry } from './core/settings-registry';
import { PluginManager } from './core/plugin-manager';
import { registerBuiltinPlugins } from './plugins/index';
import { AppShell } from './shell/AppShell';

// ── Singleton registries ────────────────────────────────────────────────────
// Created once at module load time so they survive React re-renders.

// const eventBus = new EventBus();
// const commandRegistry = new CommandRegistry();
// const viewRegistry = new ViewRegistry();
// const menuRegistry = new MenuRegistry();
// const settingsRegistry = new SettingsRegistry();

// const pluginManager = new PluginManager({
//     commands: commandRegistry,
//     views: viewRegistry,
//     menus: menuRegistry,
//     settings: settingsRegistry,
//     eventBus,
// });

// // Register all built-in plugins (does not activate them yet)
// registerBuiltinPlugins(pluginManager);

// // ── App component ────────────────────────────────────────────────────────────

// function App() {
//     const [ready, setReady] = useState(false);
//     const activatedRef = useRef(false);

//     useEffect(() => {
//         if (activatedRef.current) return;
//         activatedRef.current = true;

//         // Activate all onStartup plugins, then show the shell
//         pluginManager
//             .activateAll()
//             .then(() => setReady(true))
//             .catch((e: unknown) => {
//                 console.error('[App] Error activating plugins:', e);
//                 setReady(true); // Show shell even if some plugins failed
//             });
//     }, []);

//     if (!ready) {
//         return (
//             <div className="flex items-center justify-center h-screen w-screen bg-gray-900">
//                 <div className="flex flex-col items-center gap-3 text-gray-400">
//                     <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
//                     <span className="text-sm">Loading plugins…</span>
//                 </div>
//             </div>
//         );
//     }

//     return (
//         <AppShell
//             pluginManager={pluginManager}
//             commandRegistry={commandRegistry}
//             viewRegistry={viewRegistry}
//             menuRegistry={menuRegistry}
//             eventBus={eventBus}
//         />
//     );
// }
// frontend/src/App.tsx
import { loadBuiltInPlugins } from './plugins/builtins';
import Layout from './pages/Layout';

function App() {
    useEffect(() => {
        // 应用挂载时加载内置插件
        loadBuiltInPlugins();
    }, []);

    return (
        <>
            <Layout />
        </>
    );
}

export default App;
