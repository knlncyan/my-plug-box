import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ViewMeta } from '../core';
import { PluginViewLoader } from '../shell/PluginRenderer';

export default function Layout() {
    const [views, setViews] = useState<ViewMeta[]>([]);
    const [activeViewId, setActiveViewId] = useState<string | null>(null);

    useEffect(() => {
        // 启动时获取所有已注册的视图（包括内置和未来的外部插件）
        invoke<ViewMeta[]>('get_registered_views').then(setViews);
    }, []);

    return (
        <div className="flex h-screen">
            {/* 侧边栏：显示所有插件视图的菜单 */}
            <aside className="w-64 bg-gray-100 p-4">
                <h2 className="mb-4 font-bold">插件导航</h2>
                <ul>
                    {views.map((view) => (
                        <li key={view.id} className="mb-2">
                            <button
                                onClick={() => setActiveViewId(view.id)}
                                className={`w-full text-left p-2 rounded ${activeViewId === view.id ? 'bg-blue-500 text-white' : 'hover:bg-gray-200'
                                    }`}
                            >
                                {view.title}
                            </button>
                        </li>
                    ))}
                </ul>
            </aside>

            {/* 主内容区：动态加载对应的组件 */}
            <main className="flex-1 p-8 bg-white">
                {activeViewId ? (
                    <PluginViewLoader viewId={activeViewId} />
                ) : (
                    <div className="text-gray-500">请选择一个插件视图</div>
                )}
            </main>
        </div>
    );
}