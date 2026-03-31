import { Spinner } from "@/components/ui/spinner";
import { useCoreRuntime } from "@/core";
import { PluginViewLoader } from "@/core/PluginRenderer";
import { useAppViewStore } from "@/store/appViewStore";
import { useMemo } from "react";

export default () => {
    const { loading, ready, error, plugins, activeViewPluginId } = useCoreRuntime();
    const mainViewContent = useAppViewStore(state => state.mainViewContent);

    const activatedPlugin = useMemo(
        () => plugins.find((plugin) => plugin.pluginId === activeViewPluginId) ?? null,
        [plugins, activeViewPluginId]
    );

    if (loading && !ready) {
        return (
            <div className="flex h-[30%] items-center justify-center text-sm text-neutral-500">
                <Spinner />
            </div>
        )
    }

    return (
        <>
            {!!mainViewContent
                ? mainViewContent
                : activatedPlugin?.viewMeta
                    ? <PluginViewLoader plugin={activatedPlugin} />
                    : <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                        No view is available.
                    </div>
            }
            {!!error && (
                <div className="fixed bottom-4 right-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                    Runtime error: {error}
                </div>
            )}
        </>
    )
}