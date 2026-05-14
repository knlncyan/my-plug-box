import { useMemo, useState } from 'react';
import { Activity, Ban, Boxes, Eye, Layers2, RefreshCw, Search, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Item, ItemGroup } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { useCoreRuntime } from '@/core';
import type { PluginEntry, PluginStatus } from '@/domain/protocol';
import { useAppViewStore } from '@/store/appViewStore';

type FilterKey = 'all' | 'with-view' | 'active' | 'disabled' | 'background';
type ActionKey = 'refresh' | 'rescan' | `activate:${string}` | `deactivate:${string}` | `disable:${string}` | `view:${string}`;

const FILTER_OPTIONS: Array<{ key: FilterKey; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'with-view', label: 'With View' },
    { key: 'active', label: 'Active' },
    { key: 'disabled', label: 'Disabled' },
    { key: 'background', label: 'Background' },
];

const STATUS_META: Record<PluginStatus, { label: string; dot: string; badge: string }> = {
    registered: {
        label: 'Registered',
        dot: 'bg-yellow-500',
        badge: 'border-yellow-200 bg-yellow-50 text-yellow-700',
    },
    activating: {
        label: 'Activating',
        dot: 'bg-yellow-500',
        badge: 'border-yellow-200 bg-yellow-50 text-yellow-700',
    },
    activated: {
        label: 'Activated',
        dot: 'bg-green-500',
        badge: 'border-green-200 bg-green-50 text-green-700',
    },
    deactivating: {
        label: 'Deactivating',
        dot: 'bg-yellow-500',
        badge: 'border-yellow-200 bg-yellow-50 text-yellow-700',
    },
    inactive: {
        label: 'Inactive',
        dot: 'bg-yellow-500',
        badge: 'border-yellow-200 bg-yellow-50 text-yellow-700',
    },
    disabled: {
        label: 'Disabled',
        dot: 'bg-red-500',
        badge: 'border-red-200 bg-red-50 text-red-700',
    },
    error: {
        label: 'Error',
        dot: 'bg-red-500',
        badge: 'border-red-200 bg-red-50 text-red-700',
    },
};

export default function PluginManagerPage() {
    const {
        activeViewPluginId,
        plugins,
        refresh,
        activatePlugin,
        deactivatePlugin,
        disablePlugin,
        rescanPlugins,
        openPluginView,
    } = useCoreRuntime();
    const setMainViewContent = useAppViewStore((state) => state.setMainViewContent);

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<FilterKey>('all');
    const [pendingAction, setPendingAction] = useState<ActionKey | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);

    const metrics = useMemo(() => {
        const totalCommands = plugins.reduce((sum, plugin) => sum + plugin.commandsMeta.length, 0);

        return {
            total: plugins.length,
            active: plugins.filter((plugin) => plugin.status === 'activated').length,
            withView: plugins.filter((plugin) => !!plugin.viewMeta).length,
            disabled: plugins.filter((plugin) => plugin.status === 'disabled').length,
            commands: totalCommands,
        };
    }, [plugins]);

    const filteredPlugins = useMemo(() => {
        const normalized = query.trim().toLowerCase();

        return plugins
            .filter((plugin) => matchesFilter(plugin, filter))
            .filter((plugin) => matchesQuery(plugin, normalized))
            .slice()
            .sort((left, right) => sortPlugins(left, right, activeViewPluginId));
    }, [activeViewPluginId, filter, plugins, query]);

    const hasFilters = query.trim().length > 0 || filter !== 'all';

    const runAction = async (actionKey: ActionKey, action: () => Promise<void>, closeOnSuccess = false) => {
        setPendingAction(actionKey);
        setPageError(null);

        try {
            await action();
            if (closeOnSuccess) {
                setMainViewContent(null);
            }
        } catch (error) {
            setPageError(String(error));
        } finally {
            setPendingAction(null);
        }
    };

    return (
        <div className="h-full min-h-0 overflow-hidden">
            <div className="flex h-full min-h-0 flex-col gap-3 bg-neutral-50 p-3 sm:gap-4 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold">Plugin Manager</h2>
                        <p className="text-sm text-neutral-500">
                            Inspect installed plugins, review their runtime state, and run supported lifecycle actions.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={pendingAction !== null}
                            onClick={() => runAction('refresh', refresh)}
                        >
                            {pendingAction === 'refresh' ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
                            Refresh State
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={pendingAction !== null}
                            onClick={() => runAction('rescan', rescanPlugins)}
                        >
                            {pendingAction === 'rescan' ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
                            Rescan Plugins
                        </Button>
                    </div>
                </div>

                <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-5">
                    <MetricCard label="Installed" value={metrics.total} icon={<Boxes className="size-4" />} caption="Plugins in runtime" />
                    <MetricCard label="Active" value={metrics.active} icon={<Activity className="size-4" />} caption="Currently activated" />
                    <MetricCard label="Views" value={metrics.withView} icon={<Eye className="size-4" />} caption="Plugins with UI" />
                    <MetricCard label="Disabled" value={metrics.disabled} icon={<Ban className="size-4" />} caption="Unavailable until backend change" />
                    <MetricCard label="Commands" value={metrics.commands} icon={<Workflow className="size-4" />} caption="Registered plugin commands" />
                </div>

                <div className="flex flex-col gap-3">
                    <div className="shrink-0">
                        <InputGroup>
                            <InputGroupInput
                                placeholder="Search plugins, commands, versions, or activation events..."
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                            />
                            <InputGroupAddon>
                                <Search />
                            </InputGroupAddon>
                        </InputGroup>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {FILTER_OPTIONS.map((option) => (
                            <Button
                                key={option.key}
                                variant={filter === option.key ? 'secondary' : 'outline'}
                                size="xs"
                                onClick={() => setFilter(option.key)}
                            >
                                {option.label}
                            </Button>
                        ))}

                        {hasFilters && (
                            <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => {
                                    setQuery('');
                                    setFilter('all');
                                }}
                            >
                                Clear Filters
                            </Button>
                        )}
                    </div>
                </div>

                {pageError && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {pageError}
                    </div>
                )}

                <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-neutral-200 bg-white">
                    <div className="flex h-full min-h-0 flex-col">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3 text-xs text-neutral-500">
                            <span>Showing {filteredPlugins.length} of {plugins.length} plugins</span>
                            <span>{metrics.commands} commands across the current runtime snapshot</span>
                        </div>

                        <div className="min-h-0 flex-1 overflow-auto p-3">
                            {filteredPlugins.length > 0 ? (
                                <ItemGroup className="gap-3">
                                    {filteredPlugins.map((plugin) => {
                                        const viewSelected = activeViewPluginId === plugin.pluginId;
                                        const activationEvents = plugin.manifest.activationEvents ?? [];
                                        const isTransitioning = plugin.status === 'activating' || plugin.status === 'deactivating';
                                        const canActivate = !isTransitioning && plugin.status !== 'activated' && plugin.status !== 'disabled';
                                        const canDeactivate = !isTransitioning && plugin.status === 'activated';
                                        const canDisable = !isTransitioning && plugin.status !== 'disabled';
                                        const canOpenView = Boolean(plugin.viewMeta) && plugin.status !== 'disabled';

                                        return (
                                            <PluginCard
                                                key={plugin.pluginId}
                                                plugin={plugin}
                                                isSelected={viewSelected}
                                                pendingAction={pendingAction}
                                                canActivate={canActivate}
                                                canDeactivate={canDeactivate}
                                                canDisable={canDisable}
                                                canOpenView={canOpenView}
                                                activationEvents={activationEvents}
                                                onActivate={() => runAction(`activate:${plugin.pluginId}`, () => activatePlugin(plugin.pluginId))}
                                                onDeactivate={() => runAction(`deactivate:${plugin.pluginId}`, () => deactivatePlugin(plugin.pluginId))}
                                                onDisable={() => runAction(`disable:${plugin.pluginId}`, () => disablePlugin(plugin.pluginId))}
                                                onOpenView={() => runAction(`view:${plugin.pluginId}`, async () => {
                                                    await openPluginView(plugin.pluginId);
                                                }, true)}
                                            />
                                        );
                                    })}
                                </ItemGroup>
                            ) : (
                                <EmptyState hasPlugins={plugins.length > 0} hasFilters={hasFilters} />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function MetricCard({
    label,
    value,
    icon,
    caption,
}: {
    label: string;
    value: number;
    icon: React.ReactNode;
    caption: string;
}) {
    return (
        <div className="min-w-[9.5rem] snap-start rounded-md border border-neutral-200 bg-white px-3 py-2.5 sm:min-w-0 sm:p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-neutral-500">
                        {icon}
                        <span className="text-[11px] font-medium uppercase tracking-[0.14em]">{label}</span>
                    </div>
                </div>
                <div className="text-right text-xl font-semibold text-neutral-900 sm:text-2xl">{value}</div>
            </div>
            <div className="mt-1 hidden text-xs text-neutral-500 sm:block">{caption}</div>
        </div>
    );
}

function PluginCard({
    plugin,
    isSelected,
    pendingAction,
    canActivate,
    canDeactivate,
    canDisable,
    canOpenView,
    activationEvents,
    onActivate,
    onDeactivate,
    onDisable,
    onOpenView,
}: {
    plugin: PluginEntry;
    isSelected: boolean;
    pendingAction: ActionKey | null;
    canActivate: boolean;
    canDeactivate: boolean;
    canDisable: boolean;
    canOpenView: boolean;
    activationEvents: string[];
    onActivate: () => void;
    onDeactivate: () => void;
    onDisable: () => void;
    onOpenView: () => void;
}) {
    const statusMeta = STATUS_META[plugin.status];
    const hasView = Boolean(plugin.viewMeta);

    return (
        <Item
            variant="outline"
            className={`gap-0 border-neutral-200 bg-white p-0 ${isSelected ? 'border-neutral-400 ring-1 ring-neutral-200' : ''}`}
        >
            <div className="flex w-full flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
                            <h3 className="text-sm font-semibold text-neutral-900">{plugin.manifest.name}</h3>
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusMeta.badge}`}>
                                {statusMeta.label}
                            </span>
                            {isSelected && (
                                <span className="rounded-full border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                                    Selected
                                </span>
                            )}
                        </div>

                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
                            <span>{plugin.pluginId}</span>
                            <span>v{plugin.manifest.version}</span>
                            <span>{plugin.commandsMeta.length} commands</span>
                            <span>{hasView ? `View: ${plugin.viewMeta?.title ?? 'Available'}` : 'Background only'}</span>
                        </div>
                    </div>

                    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-right">
                        <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Manifest Id</div>
                        <div className="mt-1 text-sm font-medium text-neutral-800">{plugin.manifest.id}</div>
                    </div>
                </div>

                <p className="text-sm leading-6 text-neutral-600">
                    {plugin.manifest.description?.trim() || 'No description provided for this plugin.'}
                </p>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetaPanel label="Status" value={statusMeta.label} />
                    <MetaPanel label="View" value={hasView ? 'Available' : 'Not available'} />
                    <MetaPanel label="Activation" value={activationEvents.length > 0 ? `${activationEvents.length} event(s)` : 'Automatic'} />
                    <MetaPanel label="Source" value={plugin.commandsMeta.length > 0 ? 'Command-capable' : 'Metadata only'} />
                </div>

                {activationEvents.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Activation Events</div>
                        <div className="flex flex-wrap gap-2">
                            {activationEvents.map((eventName) => (
                                <span
                                    key={`${plugin.pluginId}-${eventName}`}
                                    className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-600"
                                >
                                    {eventName}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3">
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <Layers2 className="size-3.5" />
                        <span>{hasView ? 'This plugin can render inside the workbench.' : 'This plugin runs without a registered view.'}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="outline"
                            size="xs"
                            disabled={!canActivate || pendingAction !== null}
                            onClick={onActivate}
                        >
                            {pendingAction === `activate:${plugin.pluginId}` ? <Spinner className="size-3" /> : null}
                            Activate
                        </Button>
                        <Button
                            variant="outline"
                            size="xs"
                            disabled={!canDeactivate || pendingAction !== null}
                            onClick={onDeactivate}
                        >
                            {pendingAction === `deactivate:${plugin.pluginId}` ? <Spinner className="size-3" /> : null}
                            Deactivate
                        </Button>
                        <Button
                            variant="outline"
                            size="xs"
                            disabled={!canDisable || pendingAction !== null}
                            onClick={onDisable}
                        >
                            {pendingAction === `disable:${plugin.pluginId}` ? <Spinner className="size-3" /> : null}
                            Disable
                        </Button>
                        <Button
                            size="xs"
                            disabled={!canOpenView || pendingAction !== null}
                            onClick={onOpenView}
                        >
                            {pendingAction === `view:${plugin.pluginId}` ? <Spinner className="size-3" /> : null}
                            Open View
                        </Button>
                    </div>
                </div>
            </div>
        </Item>
    );
}

function MetaPanel({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
            <div className="mt-1 text-sm font-medium text-neutral-800">{value}</div>
        </div>
    );
}

function EmptyState({ hasPlugins, hasFilters }: { hasPlugins: boolean; hasFilters: boolean }) {
    return (
        <div className="flex h-full min-h-60 items-center justify-center rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-6 text-center">
            <div>
                <div className="text-sm font-medium text-neutral-700">
                    {hasPlugins ? 'No plugins match the current filters.' : 'No plugins are available in the current runtime snapshot.'}
                </div>
                <div className="mt-1 text-sm text-neutral-500">
                    {hasFilters
                        ? 'Try a different keyword or reset the active filters.'
                        : 'Use the rescan action to ask the backend to scan the plugin catalog again.'}
                </div>
            </div>
        </div>
    );
}

function matchesFilter(plugin: PluginEntry, filter: FilterKey): boolean {
    if (filter === 'with-view') {
        return Boolean(plugin.viewMeta);
    }
    if (filter === 'active') {
        return plugin.status === 'activated';
    }
    if (filter === 'disabled') {
        return plugin.status === 'disabled';
    }
    if (filter === 'background') {
        return !plugin.viewMeta;
    }
    return true;
}

function matchesQuery(plugin: PluginEntry, query: string): boolean {
    if (!query) {
        return true;
    }

    const haystacks = [
        plugin.pluginId,
        plugin.manifest.id,
        plugin.manifest.name,
        plugin.manifest.version,
        plugin.manifest.description ?? '',
        plugin.status,
        plugin.viewMeta?.id ?? '',
        plugin.viewMeta?.title ?? '',
        plugin.commandsMeta.map((command) => `${command.id} ${command.description}`).join(' '),
        (plugin.manifest.activationEvents ?? []).join(' '),
    ];

    return haystacks.some((value) => value.toLowerCase().includes(query));
}

function sortPlugins(left: PluginEntry, right: PluginEntry, activeViewPluginId: string | null): number {
    const leftScore = pluginSortScore(left, activeViewPluginId);
    const rightScore = pluginSortScore(right, activeViewPluginId);

    if (leftScore !== rightScore) {
        return rightScore - leftScore;
    }

    return left.manifest.name.localeCompare(right.manifest.name);
}

function pluginSortScore(plugin: PluginEntry, activeViewPluginId: string | null): number {
    let score = 0;

    if (plugin.pluginId === activeViewPluginId) {
        score += 4;
    }
    if (plugin.status === 'activated') {
        score += 3;
    }
    if (plugin.viewMeta) {
        score += 1;
    }

    return score;
}
