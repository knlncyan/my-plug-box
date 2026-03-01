// frontend/src/plugins/builtins/loader.ts
import { invoke } from '@tauri-apps/api/core';
import type { PluginManifest, ViewMeta, CommandMeta } from '../../core/types';

// 1. 使用 Vite glob 导入所有 plugin.json
// key: 相对路径 (如 './welcome/plugin.json')
// value: 模块内容
const pluginConfigs = import.meta.glob<PluginManifest>(
    './*/plugin.json',
    { eager: true }
);

let hasLoaded = false;

export async function loadBuiltInPlugins() {

    if (hasLoaded) {
        console.log('[Loader] 插件已加载，跳过本次执行');
        return;
    }
    hasLoaded = true;
    
    console.log('[Loader] 开始自动加载内置插件...', pluginConfigs);

    const loadPromises = Object.entries(pluginConfigs).map(async ([path, manifestModule]) => {
        // 从路径提取插件 ID 或文件夹名
        // 路径格式: './welcome/plugin.json' -> 提取 'welcome'
        const match = path.match(/\.\/(.+)\/plugin\.json$/);
        if (!match) return;

        const folderName = match[1];
        const manifest = manifestModule;

        try {
            console.log(`[Loader] 正在注册插件: ${manifest.id} (${folderName})`);

            // --- 核心复用逻辑开始 ---

            // 1. 注册插件本体
            await invoke('register_js_plugin', { manifest });

            // 2. 批量注册视图 (如果 json 里有 views 字段)
            if (manifest.views && Array.isArray(manifest.views)) {
                const viewPromises = manifest.views.map((view: any) => {
                    const fullView: ViewMeta = { ...view, plugin_id: manifest.id };
                    return invoke('register_view_meta', { view: fullView });
                });
                await Promise.all(viewPromises);
            }

            // 3. 批量注册命令 (如果 json 里有 commands 字段)
            if (manifest.commands && Array.isArray(manifest.commands)) {
                const cmdPromises = manifest.commands.map((cmd: any) => {
                    const fullCmd: CommandMeta = { ...cmd, plugin_id: manifest.id };
                    return invoke('register_command_meta', { command: fullCmd });
                });
                await Promise.all(cmdPromises);
            }

            // --- 核心复用逻辑结束 ---

            console.log(`[Loader] 插件 ${manifest.id} 注册成功`);
        } catch (error) {
            console.error(`[Loader] 插件 ${manifest.id} 注册失败:`, error);
            // 可以选择抛出错误停止启动，或者继续加载其他插件
        }
    });

    await Promise.all(loadPromises);
    console.log('[Loader] 所有内置插件加载完成');
}