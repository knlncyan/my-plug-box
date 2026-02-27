import { useEffect, useRef, useState } from 'react';
import type { CommandRegistry } from '../core/command-registry';
import type { RegisteredCommand } from '../core/types';

interface Props {
  commandRegistry: CommandRegistry;
  onClose: () => void;
}

export function CommandPalette({ commandRegistry, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const all = commandRegistry.getAll();
  const filtered = all.filter((cmd) => {
    const q = query.toLowerCase();
    return (
      cmd.title.toLowerCase().includes(q) ||
      cmd.id.toLowerCase().includes(q) ||
      (cmd.category?.toLowerCase() ?? '').includes(q)
    );
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        const cmd = filtered[highlighted];
        if (cmd) execute(cmd);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, highlighted, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  function execute(cmd: RegisteredCommand) {
    onClose();
    commandRegistry.execute(cmd.id).catch(console.error);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-600"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
          <span className="text-gray-400 text-sm">⌘</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command name..."
            className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none text-sm"
          />
        </div>

        {/* Results */}
        <ul className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-gray-400 text-sm text-center">No commands found</li>
          ) : (
            filtered.map((cmd, i) => (
              <li key={cmd.id}>
                <button
                  className={`w-full text-left px-4 py-2 flex items-center justify-between text-sm transition-colors ${
                    i === highlighted
                      ? 'bg-purple-500 text-white'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100'
                  }`}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => execute(cmd)}
                >
                  <span>
                    {cmd.category && (
                      <span
                        className={`mr-1 ${i === highlighted ? 'text-purple-200' : 'text-gray-400'}`}
                      >
                        {cmd.category}:
                      </span>
                    )}
                    {cmd.title}
                  </span>
                  {cmd.keybinding && (
                    <kbd
                      className={`text-xs px-1.5 py-0.5 rounded font-mono ml-4 ${
                        i === highlighted
                          ? 'bg-purple-400 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                      }`}
                    >
                      {cmd.keybinding}
                    </kbd>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
