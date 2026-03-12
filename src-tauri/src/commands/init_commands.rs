use tauri::{command};

use crate::core::{write_settings, ApiResponse, SettingsDTO};

#[command]
pub fn init_settings(data: Vec<SettingsDTO>) -> ApiResponse<()> {
    match write_settings(data) {
        Ok(_) => ApiResponse::ok(),
        Err(error) => ApiResponse::error(error),
    }
}
