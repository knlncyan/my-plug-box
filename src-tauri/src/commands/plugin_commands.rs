use crate::core::{ApiResponse, JsPluginAdapter, PluginManifest};
// src/commands.rs
use crate::core::plugin_manager::{PluginManager, PluginManagerActivation};
use crate::core::plugin_meta::{CommandMeta, PluginSummary, ViewMeta};
use std::sync::Mutex;
use tauri::{command, State};

//注册插件
#[command]
pub fn register_js_plugin(
    manager: State<'_, Mutex<PluginManager>>,
    manifest: PluginManifest,
) -> Result<ApiResponse<()>, String> {
    let mut mgr = manager.lock().map_err(|_| "锁中毒")?;
    let module = JsPluginAdapter::new(manifest.id.clone());
    mgr.register_builtin(manifest, module)
}

// 注册插件视图
#[command]
pub fn register_view_meta(
    manager: State<'_, Mutex<PluginManager>>,
    view: ViewMeta,
) -> Result<ApiResponse<()>, String> {
    let mut mgr = manager.lock().map_err(|_| "锁中毒")?;
    mgr.register_view(view)
}

// 注册命令元数据
#[command]
pub fn register_command_meta(
    manager: State<'_, Mutex<PluginManager>>,
    command: CommandMeta,
) -> Result<ApiResponse<()>, String> {
    let mut mgr = manager.lock().map_err(|_| "锁中毒")?;
    mgr.register_command(command)
}

// 获取所有插件摘要
#[command]
pub fn get_plugin_list(
    manager: State<'_, Mutex<PluginManager>>,
) -> Result<Vec<PluginSummary>, String> {
    let mgr = manager.lock().map_err(|_| "锁中毒")?;
    Ok(mgr.list_plugins())
}

// 获取所有已注册的插件视图
#[command]
pub fn get_registered_views(
    manager: State<'_, Mutex<PluginManager>>,
) -> Result<Vec<ViewMeta>, String> {
    let mgr = manager.lock().map_err(|_| "锁中毒")?;
    Ok(mgr.get_all_views())
}

// 获取所有已注册的命令元数据
#[command]
pub fn get_registered_commands(
    manager: State<'_, Mutex<PluginManager>>,
) -> Result<Vec<CommandMeta>, String> {
    let mgr = manager.lock().map_err(|_| "锁中毒")?;
    Ok(mgr.get_all_commands())
}

#[command]
pub fn activate_all_plugins(
    manager: State<'_, Mutex<PluginManager>>,
) -> Result<ApiResponse<()>, String> {
    let mut mgr = manager.lock().map_err(|_| "锁中毒")?;
    mgr.activate_all()
}

// 卸载一个插件
#[command]
pub fn deactivate_plugin(
    manager: State<'_, Mutex<PluginManager>>,
    plugin_id: String,
) -> Result<ApiResponse<()>, String> {
    let mut mgr = manager.lock().map_err(|_| "锁中毒")?;
    mgr.deactivate(&plugin_id)
}

// 激活一个已注册的插件或重新激活插件
#[command]
pub fn activate_plugin(
    manager: State<'_, Mutex<PluginManager>>,
    plugin_id: String,
) -> Result<ApiResponse<()>, String> {
    let mut mgr = manager.lock().map_err(|_| "锁中毒")?;
    mgr.activate_by_id(&plugin_id)
}
