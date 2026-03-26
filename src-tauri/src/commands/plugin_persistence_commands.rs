use crate::core::{
    read_all_plugin_settings, read_plugin_storage_snapshot, write_plugin_setting,
    write_plugin_storage_value, ApiResponse,
};
use serde_json::Value;
use tauri::command;

#[command]
pub fn get_all_plugin_settings() -> ApiResponse<Value> {
    match read_all_plugin_settings() {
        Ok(data) => ApiResponse::success(Value::Object(data), "Ok".to_string()),
        Err(error) => ApiResponse::error(error),
    }
}

#[command]
pub fn set_plugin_setting(plugin_id: String, key: String, value: Value) -> ApiResponse<()> {
    match write_plugin_setting(&plugin_id, &key, value) {
        Ok(_) => ApiResponse::ok(),
        Err(error) => ApiResponse::error(error),
    }
}

#[command]
pub fn get_plugin_storage_snapshot(plugin_id: String) -> ApiResponse<Value> {
    match read_plugin_storage_snapshot(&plugin_id) {
        Ok(data) => ApiResponse::success(Value::Object(data), "Ok".to_string()),
        Err(error) => ApiResponse::error(error),
    }
}

#[command]
pub fn set_plugin_storage_value(plugin_id: String, key: String, value: Value) -> ApiResponse<()> {
    match write_plugin_storage_value(&plugin_id, &key, value) {
        Ok(_) => ApiResponse::ok(),
        Err(error) => ApiResponse::error(error),
    }
}
