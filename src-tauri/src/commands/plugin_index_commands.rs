use crate::core::{
    register_external_manifests, scan_external_plugin_manifests, ApiResponse,
    ExternalPluginManifestDto, PluginManager,
};
use std::sync::Mutex;
use tauri::{command, State};

fn lock_error<T>() -> ApiResponse<T> {
    ApiResponse::error("failed to acquire plugin manager lock".to_string())
}

#[command]
pub fn refresh_external_plugins(
    manager: State<'_, Mutex<PluginManager>>,
) -> ApiResponse<Vec<ExternalPluginManifestDto>> {
    let manifests = match scan_external_plugin_manifests() {
        Ok(data) => data,
        Err(error) => return ApiResponse::error(error),
    };

    let mut mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };

    if let Err(error) = register_external_manifests(&mut mgr, &manifests) {
        return ApiResponse::error(error);
    }

    ApiResponse::success(manifests, "Ok".to_string())
}
