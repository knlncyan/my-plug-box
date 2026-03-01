import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ViewMeta } from '../core/types';

// 1. 自动扫描所有插件目录下的 .tsx 文件
// 注意：这里泛型改为 any 或 Record<string, any>，因为 glob 返回的是模块对象，不是直接的组件
const viewComponents = import.meta.glob<Record<string, any>>(
    '../plugins/builtins/**/*View.tsx',
    { eager: true }
);

// 辅助函数：根据 component_path 查找组件
function getComponentByPath(path: string): React.ComponentType<any> | null {
    // path 例子: "builtin.welcome/views/WelcomeView"

    // 1. 处理路径前缀
    const _path = path.startsWith('builtin.') ? path.replace('builtin.', '') : path;

    // 2. 构造 glob 匹配的 Key
    // 假设 path 是 "welcome/views/WelcomeView"
    // 拼接后: "../plugins/builtins/welcome/views/WelcomeView.tsx"
    const searchKey = `../plugins/builtins/${_path}.tsx`;

    console.log(`Trying to load component with key: ${searchKey}`);

    const module = viewComponents[searchKey];

    if (!module) {
        console.error(`❌ 组件模块未找到: ${searchKey}`);
        console.log('可用的组件 keys:', Object.keys(viewComponents));
        return null;
    }

    // 🔥 关键修正：返回 module.default (真正的组件函数)
    const Component = module.default;

    if (!Component) {
        console.error(`❌ 模块找到了，但缺少 default 导出！请检查 ${searchKey} 是否使用了 export default`);
        console.log('模块内容:', module);
        return null;
    }

    return Component;
}

export function PluginViewLoader({ viewId }: { viewId: string }) {
    const [Component, setComponent] = useState<React.ComponentType<any> | null>(null);
    const [props, setProps] = useState<any>({});

    useEffect(() => {
        async function loadView() {
            try {
                // 1. 从后端获取该视图的元数据
                const allViews = await invoke<ViewMeta[]>('get_registered_views');
                const view = allViews.find((v) => v.id === viewId);

                if (!view) {
                    console.error('视图未找到:', viewId);
                    return;
                }

                setProps(view.props || {});

                // 2. 根据 path 动态获取组件
                const comp = getComponentByPath(view.component_path);

                if (comp) {
                    // 注意：setComponent 接收的是组件函数本身
                    setComponent(() => comp);
                } else {
                    console.error('无法解析组件路径:', view.component_path);
                }
            } catch (error) {
                console.error('加载视图失败:', error);
            }
        }
        loadView();
    }, [viewId]);

    if (!Component) return <div className="p-4 text-gray-500">加载中...</div>;

    // ✅ 现在 Component 是一个有效的函数/类，可以正常渲染
    return <Component {...props} />;
}