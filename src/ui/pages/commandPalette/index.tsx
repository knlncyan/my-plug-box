import { MyDialogPortal } from "@/components/MyDialogPortal"
import {
    Command,
    CommandEmpty,
    CommandItem,
    CommandList,
    CommandGroup,
    CommandShortcut
} from "@/components/ui/command"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { useCoreRuntime } from "@/core"
import { createPopup } from "@/lib/zustand"
import { groupBy } from "lodash"
import {
    Search,
    X,
} from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

export const useCommandPaletteDialog = createPopup();

export default () => {
    const { plugins, executeCommand } = useCoreRuntime();
    const [query, setQuery] = useState('');
    const { open } = useCommandPaletteDialog.use();

    const commandGroups = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        const commands = plugins.flatMap(it => it.commandsMeta);
        const list = commands.sort((a, b) => a.id.localeCompare(b.id));
        if (!normalized) return groupBy(list, 'pluginId');
        const filteredCommands = list.filter((command) => (
            command.id.toLowerCase().includes(normalized) ||
            command.description.toLowerCase().includes(normalized) ||
            command.pluginId.toLowerCase().includes(normalized)
        ));
        return groupBy(filteredCommands, 'pluginId');
    }, [plugins, query]);

    async function runCommand(commandId: string): Promise<void> {
        try {
            // console.log('执行命令', commandId)
            await executeCommand(commandId);
            useCommandPaletteDialog.hide();
        } catch (error) {
            toast.error(`[execute-commands] ${String(error)}`, { position: 'bottom-right' });
        }
    }

    return (
        <MyDialogPortal open={open} onClose={useCommandPaletteDialog.hide} contentProps={{ className: 'top-80' }}>
            <Command className="w-100 h-120  ">
                <div className="p-2">
                    <InputGroup className="h-8 bg-neutral-100 !border-none !ring-0 focus-visible:ring-0" >
                        <InputGroupInput
                            placeholder="Type a command or search..."
                            autoFocus
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                        />
                        <InputGroupAddon>
                            <Search />
                        </InputGroupAddon>
                        <InputGroupAddon align="inline-end">
                            <div
                                onClick={() => setQuery('')}
                                className="flex h-8 w-8 pl-[-8px] items-center justify-center opacity-0 hover:opacity-100  transition-opacity duration-200 ease-in-out cursor-pointer"
                            >
                                <X className="h-4 w-4" />
                            </div>
                        </InputGroupAddon>
                    </InputGroup>
                </div>

                <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    {Object.entries(commandGroups).map(([pluginId, items]) => (
                        <CommandGroup key={pluginId} heading={pluginId}>
                            {items.map(it => (
                                <CommandItem className="cursor-pointer" key={it.id} onSelect={() => runCommand(it.id)}>
                                    <span>{it.description}</span>
                                    {it.shortcut && <CommandShortcut>{it.shortcut}</CommandShortcut>}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    ))}

                    {/* <CommandGroup heading="Suggestions"> */}
                    {/* <CommandItem>
                        <Calendar />
                        <span>Calendar</span>
                    </CommandItem>
                    <CommandItem>
                        <Smile />
                        <span>Search Emoji</span>
                    </CommandItem>
                    <CommandItem disabled>
                        <Calculator />
                        <span>Calculator</span>
                    </CommandItem> */}
                    {/* </CommandGroup> */}
                    {/* <CommandSeparator /> */}
                </CommandList>
            </Command>
        </MyDialogPortal>
    )

}
