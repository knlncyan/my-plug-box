use crate::core::PluginManager;
use std::sync::Mutex;
use tauri::Manager;

mod utils;
mod commands;
mod core;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 1.1 创建管理器
            let mut manager = PluginManager::new();
            manager.set_app_handle(app.handle().clone());
            // 1.2 交给 Tauri 管理
            app.manage(Mutex::new(manager));

            // 2. 创建系统托盘
            utils::tray::create_tray(app.handle())?;

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::register_js_plugin,
            commands::register_view_meta,
            commands::register_command_meta,
            commands::get_plugin_list,
            commands::get_registered_views,
            commands::get_registered_commands,
            commands::get_all_plugin_settings,
            commands::set_plugin_setting,
            commands::get_plugin_storage_snapshot,
            commands::set_plugin_storage_value,
            commands::activate_all_plugins,
            commands::deactivate_plugin,
            commands::activate_plugin,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
