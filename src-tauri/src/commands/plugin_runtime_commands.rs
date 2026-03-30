use crate::core::{ApiResponse, PluginEntry, PluginManager, PluginManagerActivation};
use std::sync::Mutex;
use tauri::{command, State};

fn lock_error<T>() -> ApiResponse<T> {
    ApiResponse::error("failed to acquire plugin manager lock".to_string())
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
    manager: State<'_, Mutex<PluginManager>>,
    plugin_id: String,
) -> ApiResponse<()> {
    let mut mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    mgr.disable(&plugin_id)
}
