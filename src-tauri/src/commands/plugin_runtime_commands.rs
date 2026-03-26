use crate::core::{ApiResponse, CommandMeta, PluginManager, PluginManagerActivation, PluginSummary};
use std::sync::Mutex;
use tauri::{command, State};

fn lock_error<T>() -> ApiResponse<T> {
    ApiResponse::error("failed to acquire plugin manager lock".to_string())
}

#[command]
pub fn get_plugin_list(manager: State<'_, Mutex<PluginManager>>) -> ApiResponse<Vec<PluginSummary>> {
    let mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    ApiResponse::success(mgr.list_plugins(), "Ok".to_string())
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
pub fn activate_plugin(manager: State<'_, Mutex<PluginManager>>, plugin_id: String) -> ApiResponse<()> {
    let mut mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    match mgr.activate_by_id(&plugin_id) {
        Ok(resp) => resp,
        Err(err) => ApiResponse::error(err),
    }
}

#[command]
pub fn deactivate_plugin(manager: State<'_, Mutex<PluginManager>>, plugin_id: String) -> ApiResponse<()> {
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
pub fn disable_plugin(manager: State<'_, Mutex<PluginManager>>, plugin_id: String) -> ApiResponse<()> {
    let mut mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    match mgr.disable(&plugin_id) {
        Ok(resp) => resp,
        Err(err) => ApiResponse::error(err),
    }
}
