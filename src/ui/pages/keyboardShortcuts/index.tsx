import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useCoreRuntime } from '@/core';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import EditShortcutDialog, { useEditShortcutDialog } from './EditShortcutDialog';
import { CommandMeta } from '@/domain/protocol';

export default function KeyboardShortcutsPage() {
    const { getCommandsWithShorcut } = useCoreRuntime();
    const [query, setQuery] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);

    const combineList = useMemo(() => {
        const commandsMap = getCommandsWithShorcut();
        const systemList = (commandsMap.system ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
        const pluginList = (commandsMap.commands ?? []).slice().sort((a, b) => {
            return a.pluginId === b.pluginId
                ? a.id.localeCompare(b.id)
                : a.pluginId.localeCompare(b.pluginId);
        });

        return systemList.concat(pluginList);
    }, [refreshKey]);

    const filteredCommands = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) {
            return combineList;
        }

        return combineList.filter((item) => {
            return (
                item.id.toLowerCase().includes(keyword) ||
                item.description.toLowerCase().includes(keyword) ||
                item.pluginId.toLowerCase().includes(keyword) ||
                item.shortcut?.toLowerCase().includes(keyword)
            );
        });
    }, [combineList, query]);

    const handleDoubleClick = (commandMeta: CommandMeta) => {
        useEditShortcutDialog.show({
            data: commandMeta, action: {
                refreshKeybindings: () => setRefreshKey(pre => pre + 1),
                queryKeybindings: (val: string) => setQuery(val),
            }
        });
    }

    return (
        <div className="h-full min-h-0 overflow-hidden">
            <div className="flex h-full min-h-0 flex-col gap-4 bg-neutral-50 p-4">
                <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>

                <div className="shrink-0">
                    <InputGroup>
                        <InputGroupInput
                            placeholder="Search..."
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                        <InputGroupAddon>
                            <Search />
                        </InputGroupAddon>
                    </InputGroup>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden bg-white">
                    <div className="h-full overflow-auto">
                        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
                            <thead>
                                <tr>
                                    <th className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-3 py-2 text-left font-bold whitespace-nowrap">
                                        CommandId
                                    </th>
                                    <th className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-3 py-2 text-left font-bold whitespace-nowrap">
                                        Description
                                    </th>
                                    <th className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-3 py-2 text-left font-bold whitespace-nowrap">
                                        Shortcut
                                    </th>
                                    <th className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-3 py-2 text-left font-bold whitespace-nowrap">
                                        Scope
                                    </th>
                                    <th className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-3 py-2 text-left font-bold whitespace-nowrap">
                                        Source
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCommands.map((item) => (
                                    <tr key={item.id} className="hover:bg-neutral-100 cursor-default select-none odd:bg-neutral-50" onDoubleClick={() => handleDoubleClick(item)}>
                                        <td className="border-b border-neutral-100 px-3 py-2 align-middle whitespace-nowrap">{item.id}</td>
                                        <td className="border-b border-neutral-100 px-3 py-2 align-middle whitespace-nowrap">{item.description}</td>
                                        <td className="border-b border-neutral-100 px-3 py-2 align-middle whitespace-nowrap"><ShortcutTags text={item.shortcut} /></td>
                                        <td className="border-b border-neutral-100 px-3 py-2 align-middle whitespace-nowrap">{item.shortcutScope ?? 'local'}</td>
                                        <td className="border-b border-neutral-100 px-3 py-2 align-middle whitespace-nowrap">{item.pluginId}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {filteredCommands.length === 0 && (
                            <div className="p-6 text-center text-sm text-neutral-500">No commands found.</div>
                        )}
                    </div>
                </div>
            </div>
            <EditShortcutDialog />
        </div>
    );
}

function ShortcutTags({ text }: { text?: string }) {
    if (!text) return text;
    const keyParts = text.split('+');
    return (
        <div className="flex h-6 w-full gap-1">
            {keyParts.map((key, index) => (
                <span key={`${key}-${index}`} className="flex items-center  px-2 h-6 text-white bg-neutral-350 rounded text-sm font-medium">
                    {key}
                </span>
            ))}
        </div>
    )
}
