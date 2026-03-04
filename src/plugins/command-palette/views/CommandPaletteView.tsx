/**
 * Command palette view for discovering and running all registered commands.
 */
import { useMemo, useState } from 'react';
import { useCoreRuntime } from '../../../core';

export default function CommandPaletteView() {
  const { commands, executeCommand } = useCoreRuntime();
  const [query, setQuery] = useState('');
  const [lastResult, setLastResult] = useState<string>('');
  const [runError, setRunError] = useState<string>('');

  const filteredCommands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const list = [...commands].sort((a, b) => a.id.localeCompare(b.id));
    if (!normalized) return list;
    return list.filter((command) => {
      return (
        command.id.toLowerCase().includes(normalized) ||
        command.description.toLowerCase().includes(normalized) ||
        command.plugin_id.toLowerCase().includes(normalized)
      );
    });
  }, [commands, query]);

  async function runCommand(commandId: string): Promise<void> {
    try {
      setRunError('');
      const result = await executeCommand(commandId);
      setLastResult(
        result === undefined
          ? `Executed: ${commandId}`
          : `Executed: ${commandId}, result: ${String(result)}`
      );
    } catch (error) {
      setRunError(String(error));
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Command Palette</h1>
      <p className="mt-2 text-sm text-slate-500">
        Browse every registered command and run it directly from this view.
      </p>

      <div className="mt-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by command id, description, or plugin id"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      <div className="mt-4 rounded border border-slate-200">
        <div className="grid grid-cols-[minmax(220px,1fr)_minmax(200px,1fr)_120px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <div>Command ID</div>
          <div>Description</div>
          <div>Action</div>
        </div>
        <ul>
          {filteredCommands.map((command) => (
            <li
              key={command.id}
              className="grid grid-cols-[minmax(220px,1fr)_minmax(200px,1fr)_120px] gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0"
            >
              <div>
                <div className="font-mono text-slate-900">{command.id}</div>
                <div className="text-xs text-slate-500">{command.plugin_id}</div>
              </div>
              <div className="text-slate-700">{command.description}</div>
              <div>
                <button
                  onClick={() => void runCommand(command.id)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                >
                  Run
                </button>
              </div>
            </li>
          ))}
          {filteredCommands.length === 0 ? (
            <li className="px-3 py-4 text-sm text-slate-500">No commands match your search.</li>
          ) : null}
        </ul>
      </div>

      {lastResult ? (
        <div className="mt-4 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {lastResult}
        </div>
      ) : null}

      {runError ? (
        <div className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {runError}
        </div>
      ) : null}
    </div>
  );
}
