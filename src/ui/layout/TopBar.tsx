import { CSSProperties, useEffect } from "react";
import { X, Minus, Copy, ChevronDown } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useCoreRuntime } from "@/core";
import lifecycleTrigger from "@/lib/lifecycleTrigger";
import { listen } from "@tauri-apps/api/event";

export default () => {
    const { shutdown } = useCoreRuntime();
    const appWindow = getCurrentWindow();

    const minimize = () => {
        appWindow.minimize();
    }

    const toggleMaximize = () => {
        appWindow.toggleMaximize();
    }

    const closeApp = async () => {
        shutdown();
        await lifecycleTrigger.shutdownClose();
        // alert("清理完成");
        appWindow.close();
    }

    const minimizeToTray = async () => {
        await appWindow.hide();
    };

    useEffect(() => {
        let unlisten: (() => void) | undefined;

        const setupListener = async () => {
            unlisten = await listen<string>('window-close-requested', async (event) => {
                console.log('拦截到关闭事件:', event.payload);
                try {
                    await closeApp();
                } catch (err) {
                    appWindow.close();
                }
            });
        };

        setupListener();

        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    return (
        <div
            className="flex h-8 w-full items-center bg-neutral-150"
            style={{ WebkitAppRegion: 'drag' } as CSSProperties}
        >
            {/* 窗口标题（可选） */}
            <img src="src/assets/tauri.svg" className="w-5 h-5 ml-2" />
            <span className="ml-2 text-sm font-medium">Plug Box</span>

            {/* 窗口控制按钮 - 靠右 */}
            <div
                className="ml-auto flex items-center"
                style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            >
                {/* 最小化到托盘 */}
                <button
                    onClick={minimizeToTray}
                    className="flex h-8 w-8 items-center justify-center rounded hover:bg-black/10"
                >
                    <ChevronDown className="h-3.5 w-3.5 " />
                </button>
                {/* 最小化 */}
                <button
                    onClick={minimize}
                    className="flex h-8 w-8 items-center justify-center rounded hover:bg-black/10"
                >
                    <Minus className="h-3.5 w-3.5 " />
                </button>

                {/* 最大化/还原 */}
                <button
                    onClick={toggleMaximize}
                    className="flex h-8 w-8 items-center justify-center rounded hover:bg-black/10"
                >
                    <Copy className="h-3 w-3 text-neutral-950 scale-x-[-1]" />
                </button>

                {/* 关闭 */}
                <button
                    onClick={closeApp}
                    className="flex h-8 w-8 items-center justify-center rounded hover:bg-red-400"
                >
                    <X className="h-4 w-4 " />
                </button>
            </div>
        </div>
    )
}