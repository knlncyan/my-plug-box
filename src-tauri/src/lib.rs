use crate::core::{shortcut_manager::ShortcutManager, PluginManager};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{Emitter, Manager, WindowEvent};

mod commands;
mod core;
mod utils;

pub struct CloseState {
    pub is_closing: AtomicBool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = CloseState {
        is_closing: AtomicBool::new(false),
    };

    tauri::Builder::default()
        .setup(|app| {
            // 1.1 创建管理器
            let manager = PluginManager::new();
            let shortcut_manager = ShortcutManager::new();
            // 1.2 交给 Tauri 管理
            app.manage(Mutex::new(manager));
            app.manage(Mutex::new(shortcut_manager));
            app.manage(state);
            // 2. 创建系统托盘
            utils::tray::create_tray(app.handle())?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle().clone();
                let state = app.state::<CloseState>();

                if state.is_closing.load(Ordering::SeqCst) {
                    state.is_closing.store(false, Ordering::SeqCst);
                    return;
                }

                state.is_closing.store(true, Ordering::SeqCst);

                api.prevent_close();

                let app_clone: tauri::AppHandle = app.clone();
                let label = window.label().to_string();
                tauri::async_runtime::spawn(async move {
                    let _ = app_clone.emit("window-close-requested", label);
                });
            }
            if let WindowEvent::Destroyed = event {
                if let Some(s) = window.app_handle().try_state::<CloseState>() {
                    s.is_closing.store(false, Ordering::SeqCst);
                }
            }
        })
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // 插件运行状态管理
            commands::refresh_external_plugins,
            commands::get_plugins_runtime,
            commands::activate_plugin,
            commands::deactivate_plugin,
            commands::disable_plugin,
            // 插件设置、存储管理
            commands::get_all_plugin_settings,
            commands::set_plugin_setting,
            commands::get_plugin_storage_snapshot,
            commands::set_plugin_storage_value,
            // 快捷键管理
            commands::get_shortcut_list,
            commands::update_shortcut,
            commands::reset_shortcut
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
