/**
 * Tauri command adapters for plugin manager.
 * All commands return ApiResponse<T> for consistent frontend handling.
 */
use crate::core::{
    ApiResponse, CommandMeta, JsPluginAdapter, PluginManager, PluginManagerActivation,
    PluginManifest, PluginSummary, ViewMeta,
};
use std::sync::Mutex;
use tauri::{command, State};

fn lock_error<T>() -> ApiResponse<T> {
    ApiResponse::error("failed to acquire plugin manager lock".to_string())
}

#[command]
pub fn register_js_plugin(
    manager: State<'_, Mutex<PluginManager>>,
    manifest: PluginManifest,
) -> ApiResponse<()> {
    let mut mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    let module = JsPluginAdapter::new(manifest.id.clone());
    match mgr.register_builtin(manifest, module) {
        Ok(resp) => resp,
        Err(err) => ApiResponse::error(err),
    }
}

#[command]
pub fn register_view_meta(
    manager: State<'_, Mutex<PluginManager>>,
    view: ViewMeta,
) -> ApiResponse<()> {
    let mut mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    match mgr.register_view(view) {
        Ok(resp) => resp,
        Err(err) => ApiResponse::error(err),
    }
}

#[command]
pub fn register_command_meta(
    manager: State<'_, Mutex<PluginManager>>,
    command: CommandMeta,
) -> ApiResponse<()> {
    let mut mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    match mgr.register_command(command) {
        Ok(resp) => resp,
        Err(err) => ApiResponse::error(err),
    }
}

#[command]
pub fn get_plugin_list(
    manager: State<'_, Mutex<PluginManager>>,
) -> ApiResponse<Vec<PluginSummary>> {
    let mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    ApiResponse::success(mgr.list_plugins(), "Ok".to_string())
}

#[command]
pub fn get_registered_views(
    manager: State<'_, Mutex<PluginManager>>,
) -> ApiResponse<Vec<ViewMeta>> {
    let mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    ApiResponse::success(mgr.get_all_views(), "Ok".to_string())
}

#[command]
pub fn get_registered_commands(
    manager: State<'_, Mutex<PluginManager>>,
) -> ApiResponse<Vec<CommandMeta>> {
    let mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    ApiResponse::success(mgr.get_all_commands(), "Ok".to_string())
}

#[command]
pub fn assert_command_exposed(
    manager: State<'_, Mutex<PluginManager>>,
    command_id: String,
    caller_plugin_id: Option<String>,
) -> ApiResponse<()> {
    let mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    mgr.assert_command_exposed(&command_id, caller_plugin_id.as_deref())
}

#[command]
pub fn activate_all_plugins(
    manager: State<'_, Mutex<PluginManager>>,
) -> ApiResponse<()> {
    let mut mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    match mgr.activate_all() {
        Ok(resp) => resp,
        Err(err) => ApiResponse::error(err),
    }
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
    match mgr.deactivate(&plugin_id) {
        Ok(resp) => resp,
        Err(err) => ApiResponse::error(err),
    }
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
    match mgr.activate_by_id(&plugin_id) {
        Ok(resp) => resp,
        Err(err) => ApiResponse::error(err),
    }
}
