use crate::{
    core::{
        plugin_index_utils, read_disabled_plugin_ids, shortcut_manager::ShortcutManager, PluginEntry, PluginManager,
        PluginManagerActivation,
    },
    utils::ApiResponse,
};
use std::sync::Mutex;
use tauri::{command, AppHandle, State};

fn lock_error<T>() -> ApiResponse<T> {
    ApiResponse::error("failed to acquire plugin manager lock".to_string())
}

fn restore_runtime_and_shortcuts(
    app: &AppHandle,
    plugin_manager: &mut PluginManager,
    shortcut_manager: &mut ShortcutManager,
    previous_runtime: Vec<PluginEntry>,
    previous_commands: Vec<crate::core::CommandMeta>,
) -> Result<(), String> {
    plugin_manager.restore_runtime(previous_runtime);
    shortcut_manager.refresh_shortcuts(app, &previous_commands)?;
    shortcut_manager.register_commands(app, previous_commands)
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
        let previous_runtime = mgr.list_plugins_runtime();
        let previous_commands = mgr.lise_plugins_commands();

        let disabled_plugin_ids = match read_disabled_plugin_ids(app.clone()) {
            Ok(data) => data,
            Err(error) => return ApiResponse::error(error),
        };

        // 注册插件
        if let Err(error) = mgr.register(manifests, &disabled_plugin_ids) {
            return ApiResponse::error(error);
        }

        (mgr.lise_plugins_commands(), previous_runtime, previous_commands)
    };
    let (new_commands, previous_runtime, previous_commands) = new_commands;

    {
        let mut mgr = match manager.lock() {
            Ok(mgr) => mgr,
            Err(_) => return lock_error(),
        };
        let mut smg = match shortcut_manager.lock() {
            Ok(smg) => smg,
            Err(_) => return lock_error(),
        };
        if let Err(error) = smg.refresh_shortcuts(&app, &new_commands) {
            let rollback_error = restore_runtime_and_shortcuts(&app, &mut mgr, &mut smg, previous_runtime.clone(), previous_commands.clone());
            return ApiResponse::error(match rollback_error {
                Ok(_) => error,
                Err(rollback_error) => format!("{}; rollback failed: {}", error, rollback_error),
            });
        }
        if let Err(error) = smg.register_commands(&app, new_commands) {
            let rollback_error = restore_runtime_and_shortcuts(&app, &mut mgr, &mut smg, previous_runtime, previous_commands);
            return ApiResponse::error(match rollback_error {
                Ok(_) => error,
                Err(rollback_error) => format!("{}; rollback failed: {}", error, rollback_error),
            });
        }
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
