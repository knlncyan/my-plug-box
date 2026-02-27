import type { MenuRegistry } from '../core/menu-registry';
import type { CommandRegistry } from '../core/command-registry';

interface Props {
  menuRegistry: MenuRegistry;
  commandRegistry: CommandRegistry;
  onOpenCommandPalette: () => void;
}

export function MenuBar({ menuRegistry, commandRegistry, onOpenCommandPalette }: Props) {
  const items = menuRegistry.getItems('menubar');
  const allCommands = commandRegistry.getAll();

  function titleFor(commandId: string): string {
    const cmd = allCommands.find((c) => c.id === commandId);
    if (!cmd) return commandId;
    return cmd.category ? `${cmd.category}: ${cmd.title}` : cmd.title;
  }

  return (
    <div className="flex items-center h-9 bg-gray-900 text-gray-300 text-sm px-3 gap-1 flex-shrink-0 border-b border-gray-700">
      {/* App name */}
      <span className="font-semibold text-purple-400 mr-3 select-none">plug-box</span>

      {/* Plugin-contributed menu items */}
      {items.map((item, i) => (
        <button
          key={`${item.command}-${i}`}
          className="px-2 py-1 hover:bg-gray-700 rounded text-xs transition-colors"
          onClick={() => commandRegistry.execute(item.command).catch(console.error)}
        >
          {titleFor(item.command)}
        </button>
      ))}

      <div className="flex-1" />

      {/* Command palette shortcut hint */}
      <button
        className="flex items-center gap-1 px-2 py-1 hover:bg-gray-700 rounded text-xs text-gray-500 transition-colors"
        onClick={onOpenCommandPalette}
      >
        <span>Command Palette</span>
        <kbd className="bg-gray-800 border border-gray-600 px-1 rounded text-gray-400 font-mono text-[10px]">
          Ctrl+Shift+P
        </kbd>
      </button>
    </div>
  );
}
