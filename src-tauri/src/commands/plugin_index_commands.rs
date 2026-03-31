use crate::core::{
    scan_external_plugin_manifests, ApiResponse, PluginEntry, PluginManager,
    PluginManagerActivation,
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
) -> ApiResponse<Vec<PluginEntry>> {
    let manifests = match scan_external_plugin_manifests(app) {
        Ok(data) => data,
        Err(error) => return ApiResponse::error(error),
    };

    let mut mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };

    if let Err(error) = mgr.register(manifests) {
        return ApiResponse::error(error);
    }
    println!("读取并加载");
    ApiResponse::success(mgr.list_plugins_runtime(), "Ok".to_string())
}
