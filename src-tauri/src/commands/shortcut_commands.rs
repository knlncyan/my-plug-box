use crate::{
    core::{
        shortcut_manager::{CommandCategory, ShortcutManager, ShortcutUpdateDTO},
        CommandMeta,
    },
    utils::ApiResponse,
};
use std::{collections::HashMap, sync::Mutex};
use tauri::{command, AppHandle, State};

fn lock_error<T>() -> ApiResponse<T> {
    ApiResponse::error("failed to acquire plugin manager lock".to_string())
}

/// 获取所有快捷键信息
#[command]
pub fn get_shortcut_list(
    manager: State<'_, Mutex<ShortcutManager>>,
) -> ApiResponse<HashMap<CommandCategory, Vec<CommandMeta>>> {
    let mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    return ApiResponse::success(mgr.list_shortcut_map(), "Ok".to_string());
}

/// 更新快捷键
#[command]
pub fn update_shortcut(
    app: AppHandle,
    manager: State<'_, Mutex<ShortcutManager>>,
    dto: ShortcutUpdateDTO,
) -> ApiResponse<Option<CommandMeta>> {
    let mut mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    return match mgr.update_shortcut(&app, dto) {
        Ok(data) => ApiResponse::success(data, "Ok".to_string()),
        Err(error) => ApiResponse::error(error),
    };
}

/// 重置快捷键
#[command]
pub fn reset_shortcut(
    app: AppHandle,
    manager: State<'_, Mutex<ShortcutManager>>,
    dto: ShortcutUpdateDTO,
) -> ApiResponse<Option<CommandMeta>> {
    let mut mgr = match manager.lock() {
        Ok(mgr) => mgr,
        Err(_) => return lock_error(),
    };
    return match mgr.reset_shortcut(&app, &dto.id, &dto.category) {
        Ok(data) => ApiResponse::success(data, "Ok".to_string()),
        Err(error) => ApiResponse::error(error),
    };
}
