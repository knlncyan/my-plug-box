import { useEffect, useState } from 'react';
import type { PluginManager } from '../core/plugin-manager';
import type { CommandRegistry } from '../core/command-registry';
import type { ViewRegistry } from '../core/view-registry';
import type { MenuRegistry } from '../core/menu-registry';
import type { EventBus } from '../core/event-bus';
import { MenuBar } from './MenuBar';
import { Sidebar } from './Sidebar';
import { MainArea } from './MainArea';
import { CommandPalette } from './CommandPalette';

interface Props {
    pluginManager: PluginManager;
    commandRegistry: CommandRegistry;
    viewRegistry: ViewRegistry;
    menuRegistry: MenuRegistry;
    eventBus: EventBus;
}

export function AppShell({
    pluginManager: _pluginManager,
    commandRegistry,
    viewRegistry,
    menuRegistry,
    eventBus,
}: Props) {
    const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
    // Incrementing this forces re-render when any registry changes
    const [tick, setTick] = useState(0);

    // Subscribe to registry changes so the shell re-renders when plugins
    // add/remove commands, views, or menu items
    useEffect(() => {
        const inc = () => setTick((t) => t + 1);
        const d1 = viewRegistry.onChange(inc);
        const d2 = menuRegistry.onChange(inc);
        const d3 = commandRegistry.onChange(inc);
        return () => { d1.dispose(); d2.dispose(); d3.dispose(); };
    }, [viewRegistry, menuRegistry, commandRegistry]);

    // Global keyboard shortcut: Ctrl+Shift+P → command palette
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                setCmdPaletteOpen((v) => !v);
            }
        }
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    // Plugins can open the command palette by emitting 'workbench.openCommandPalette'
    useEffect(() => {
        const d = eventBus.on('workbench.openCommandPalette', () => setCmdPaletteOpen(true));
        return () => d.dispose();
    }, [eventBus]);

    // Suppress unused-variable warning from tick — it's used to trigger re-renders
    void tick;

    return (
        <div className="flex flex-col h-screen w-screen overflow-hidden bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            <MenuBar
                menuRegistry={menuRegistry}
                commandRegistry={commandRegistry}
                onOpenCommandPalette={() => setCmdPaletteOpen(true)}
            />

            <div className="flex flex-1 overflow-hidden">
                <Sidebar viewRegistry={viewRegistry} />
                <MainArea viewRegistry={viewRegistry} eventBus={eventBus} />
            </div>

            {cmdPaletteOpen && (
                <CommandPalette
                    commandRegistry={commandRegistry}
                    onClose={() => setCmdPaletteOpen(false)}
                />
            )}
        </div>
    );
}
