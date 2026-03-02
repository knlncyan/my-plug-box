use crate::core::PluginManager;
use std::sync::Mutex;
use tauri::Manager;

mod commands;
mod core;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 1. 创建管理器
            let mut manager = PluginManager::new();

            // 2. 注入 AppHandle (关键！)
            manager.set_app_handle(app.handle().clone());

            // 3. (可选) 注册内置 Rust 插件
            // let manifest = PluginManifest { ... };
            // let module = MyNativePlugin::new();
            // manager.register_builtin(manifest, module);

            // 4. 交给 Tauri 管理
            app.manage(Mutex::new(manager));

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
            commands::assert_command_exposed,
            commands::activate_all_plugins,
            commands::deactivate_plugin,
            commands::activate_plugin,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
