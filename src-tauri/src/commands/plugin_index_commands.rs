use crate::{
    core::{
        plugin_index_utils, shortcut_manager::ShortcutManager, PluginEntry, PluginManager,
        PluginManagerActivation,
    },
    utils::ApiResponse,
};
use std::sync::Mutex;
use tauri::{command, AppHandle, State};

fn lock_error<T>() -> ApiResponse<T> {
    ApiResponse::error("failed to acquire plugin manager lock".to_string())
}

/// 读取插件资源并注册插件
#[command]
pub fn refresh_external_plugins(
    app: AppHandle,
    manager: State<'_, Mutex<PluginManager>>,
    shortcut_manager: State<'_, Mutex<ShortcutManager>>,
) -> ApiResponse<Vec<PluginEntry>> {
    let manifests = match plugin_index_utils::scan_external_plugin_manifests(&app) {
        Ok(data) => data,
        Err(error) => return ApiResponse::error(error),
    };

    let new_commands = {
        let mut mgr = match manager.lock() {
            Ok(mgr) => mgr,
            Err(_) => return lock_error(),
        };

        // 注册插件
        if let Err(error) = mgr.register(manifests) {
            return ApiResponse::error(error);
        }

        mgr.lise_plugins_commands()
    };

    {
        let mut smg = match shortcut_manager.lock() {
            Ok(smg) => smg,
            Err(_) => return lock_error(),
        };
        smg.refresh_shortcuts(&app);
        smg.register_commands(&app, new_commands);
    }

    let result = {
        let mgr = match manager.lock() {
            Ok(mgr) => mgr,
            Err(_) => return lock_error(),
        };
        mgr.list_plugins_runtime()
    };

    ApiResponse::success(result, "Ok".to_string())
}
