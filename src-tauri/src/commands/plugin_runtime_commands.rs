use crate::{core::{set_plugin_disabled, shortcut_manager::ShortcutManager, PluginEntry, PluginManager, PluginManagerActivation}, utils::ApiResponse};
use std::sync::Mutex;
use tauri::{command, AppHandle, State};

fn lock_error<T>() -> ApiResponse<T> {
    ApiResponse::error("failed to acquire plugin manager lock".to_string())
}

fn sync_shortcuts(
    app: &AppHandle,
    manager: &mut ShortcutManager,
    commands: Vec<crate::core::CommandMeta>,
) -> Result<(), String> {
    manager.refresh_shortcuts(app, &commands)?;
    manager.register_commands(app, commands)
}

fn rollback_plugin_toggle(
    app: &AppHandle,
    plugin_id: &str,
    should_disable: bool,
    plugin_manager: &mut PluginManager,
    shortcut_manager: &mut ShortcutManager,
    previous_commands: Vec<crate::core::CommandMeta>,
) -> Result<(), String> {
    let toggle_result = if should_disable {
        plugin_manager.disable(plugin_id)
    } else {
        plugin_manager.enable(plugin_id)
    };

    if !toggle_result.success {
        return Err(format!("failed to rollback plugin state: {}", toggle_result.message));
    }

    set_plugin_disabled(plugin_id, should_disable, app.clone())?;
    sync_shortcuts(app, shortcut_manager, previous_commands)
}

/// 获取插件运行时（包含状态），不重新加载插件资源
#[command]
pub fn get_plugins_runtime(
    manager: State<'_, Mutex<PluginManager>>,
) -> ApiResponse<Vec<PluginEntry>> {
    let mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    ApiResponse::success(mgr.list_plugins_runtime(), "Ok".to_string())
}

#[command]
pub fn activate_plugin(
    manager: State<'_, Mutex<PluginManager>>,
    plugin_id: String,
) -> ApiResponse<()> {
    let mut mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    mgr.activate(&plugin_id)
}

#[command]
pub fn deactivate_plugin(
    manager: State<'_, Mutex<PluginManager>>,
    plugin_id: String,
) -> ApiResponse<()> {
    let mut mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    mgr.deactivate(&plugin_id)
}

#[command]
pub fn disable_plugin(
    app: AppHandle,
    manager: State<'_, Mutex<PluginManager>>,
    shortcut_manager: State<'_, Mutex<ShortcutManager>>,
    plugin_id: String,
) -> ApiResponse<()> {
    let mut mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    let mut smg = match shortcut_manager.lock() {
        Ok(smg) => smg,
        Err(_) => return lock_error(),
    };
    let previous_commands = mgr.lise_plugins_commands();

    let response = mgr.disable(&plugin_id);
    if !response.success {
        return response;
    }

    if let Err(error) = set_plugin_disabled(&plugin_id, true, app.clone()) {
        let rollback_error = rollback_plugin_toggle(&app, &plugin_id, false, &mut mgr, &mut smg, previous_commands.clone());
        return ApiResponse::error(match rollback_error {
            Ok(_) => error,
            Err(rollback_error) => format!("{}; rollback failed: {}", error, rollback_error),
        });
    }

    let commands = mgr.lise_plugins_commands();
    if let Err(error) = sync_shortcuts(&app, &mut smg, commands) {
        let rollback_error = rollback_plugin_toggle(&app, &plugin_id, false, &mut mgr, &mut smg, previous_commands);
        return ApiResponse::error(match rollback_error {
            Ok(_) => error,
            Err(rollback_error) => format!("{}; rollback failed: {}", error, rollback_error),
        });
    }

    ApiResponse::ok()
}

#[command]
pub fn enable_plugin(
    app: AppHandle,
    manager: State<'_, Mutex<PluginManager>>,
    shortcut_manager: State<'_, Mutex<ShortcutManager>>,
    plugin_id: String,
) -> ApiResponse<()> {
    let mut mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    let mut smg = match shortcut_manager.lock() {
        Ok(smg) => smg,
        Err(_) => return lock_error(),
    };
    let previous_commands = mgr.lise_plugins_commands();

    let response = mgr.enable(&plugin_id);
    if !response.success {
        return response;
    }

    if let Err(error) = set_plugin_disabled(&plugin_id, false, app.clone()) {
        let rollback_error = rollback_plugin_toggle(&app, &plugin_id, true, &mut mgr, &mut smg, previous_commands.clone());
        return ApiResponse::error(match rollback_error {
            Ok(_) => error,
            Err(rollback_error) => format!("{}; rollback failed: {}", error, rollback_error),
        });
    }

    let commands = mgr.lise_plugins_commands();
    if let Err(error) = sync_shortcuts(&app, &mut smg, commands) {
        let rollback_error = rollback_plugin_toggle(&app, &plugin_id, true, &mut mgr, &mut smg, previous_commands);
        return ApiResponse::error(match rollback_error {
            Ok(_) => error,
            Err(rollback_error) => format!("{}; rollback failed: {}", error, rollback_error),
        });
    }

    ApiResponse::ok()
}
