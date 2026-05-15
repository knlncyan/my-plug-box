/// 插件持久化存储模块（JSON 文件实现）。
/// 设计约束：
/// 1) settings：单文件存储，键格式为 `pluginId.key`。
/// 2) storage：按插件分文件存储，文件名由插件 ID 安全转换得到。
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

/// 读取整个settings。
pub fn read_all_plugin_settings(app: AppHandle) -> Result<Map<String, Value>, String> {
    let path = settings_file_path(app)?;
    read_json_object(&path)
}

/// 写入某个插件单个 settings 项。
pub fn write_plugin_setting(
    plugin_id: &str,
    key: &str,
    value: Value,
    app: AppHandle,
) -> Result<(), String> {
    let scoped_key = format!("{}.{}", plugin_id, key);
    let path = settings_file_path(app)?;
    let mut data = read_json_object(&path)?;
    data.insert(scoped_key, value);
    write_json_object(&path, &data)
}

/// 读取某个插件 storage 快照。
pub fn read_plugin_storage_snapshot(
    plugin_id: &str,
    app: AppHandle,
) -> Result<Map<String, Value>, String> {
    let path = plugin_storage_file_path(plugin_id, app)?;
    read_json_object(&path)
}

/// 写入某个插件 storage 键值。
pub fn write_plugin_storage_value(
    plugin_id: &str,
    key: &str,
    value: Value,
    app: AppHandle,
) -> Result<(), String> {
    let path = plugin_storage_file_path(plugin_id, app)?;
    let mut data = read_json_object(&path)?;
    data.insert(key.to_string(), value);
    write_json_object(&path, &data)
}

/// 读取被宿主停用的插件 ID 集合。
pub fn read_disabled_plugin_ids(app: AppHandle) -> Result<HashSet<String>, String> {
    let path = disabled_plugins_file_path(app)?;
    read_json_string_set(&path)
}

/// 持久化被宿主停用的插件 ID 集合。
pub fn write_disabled_plugin_ids(ids: &HashSet<String>, app: AppHandle) -> Result<(), String> {
    let path = disabled_plugins_file_path(app)?;
    write_json_string_set(&path, ids)
}

/// 更新单个插件的停用状态。
pub fn set_plugin_disabled(plugin_id: &str, disabled: bool, app: AppHandle) -> Result<(), String> {
    let mut ids = read_disabled_plugin_ids(app.clone())?;
    if disabled {
        ids.insert(plugin_id.to_string());
    } else {
        ids.remove(plugin_id);
    }

    write_disabled_plugin_ids(&ids, app)
}

fn persistence_root(app: AppHandle) -> Result<PathBuf, String> {
    let seeting_root = app
        .path()
        .resolve(".plug_data", BaseDirectory::AppData)
        .map_err(|e| e.to_string())?;
    Ok(seeting_root)
}

fn settings_file_path(app: AppHandle) -> Result<PathBuf, String> {
    let mut path = persistence_root(app)?;
    path.push("settings.json");
    Ok(path)
}

fn plugin_storage_file_path(plugin_id: &str, app: AppHandle) -> Result<PathBuf, String> {
    let mut path = persistence_root(app)?;
    path.push("storage");
    path.push(format!("{}.json", sanitize_plugin_id(plugin_id)));
    Ok(path)
}

fn disabled_plugins_file_path(app: AppHandle) -> Result<PathBuf, String> {
    let mut path = persistence_root(app)?;
    path.push("disabled_plugins.json");
    Ok(path)
}

fn sanitize_plugin_id(plugin_id: &str) -> String {
    plugin_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '.' || ch == '_' || ch == '-' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn read_json_object(path: &Path) -> Result<Map<String, Value>, String> {
    if !path.exists() {
        return Ok(Map::new());
    }

    let raw = fs::read_to_string(path)
        .map_err(|error| format!("failed to read {}: {}", path.display(), error))?;
    if raw.trim().is_empty() {
        return Ok(Map::new());
    }

    let parsed: Value = serde_json::from_str(&raw)
        .map_err(|error| format!("failed to parse json {}: {}", path.display(), error))?;

    match parsed {
        Value::Object(object) => Ok(object),
        _ => Err(format!(
            "invalid json root in {}: expected object",
            path.display()
        )),
    }
}

fn read_json_string_set(path: &Path) -> Result<HashSet<String>, String> {
    if !path.exists() {
        return Ok(HashSet::new());
    }

    let raw = fs::read_to_string(path)
        .map_err(|error| format!("failed to read {}: {}", path.display(), error))?;
    if raw.trim().is_empty() {
        return Ok(HashSet::new());
    }

    let parsed: Value = serde_json::from_str(&raw)
        .map_err(|error| format!("failed to parse json {}: {}", path.display(), error))?;

    match parsed {
        Value::Array(values) => {
            let mut result = HashSet::new();
            for value in values {
                match value {
                    Value::String(text) => {
                        result.insert(text);
                    }
                    _ => {
                        return Err(format!(
                            "invalid json root in {}: expected string array",
                            path.display()
                        ));
                    }
                }
            }

            Ok(result)
        }
        _ => Err(format!(
            "invalid json root in {}: expected array",
            path.display()
        )),
    }
}

fn write_json_object(path: &Path, data: &Map<String, Value>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create dir {}: {}", parent.display(), error))?;
    }

    let raw = serde_json::to_string_pretty(data)
        .map_err(|error| format!("failed to serialize json {}: {}", path.display(), error))?;
    fs::write(path, raw).map_err(|error| format!("failed to write {}: {}", path.display(), error))
}

fn write_json_string_set(path: &Path, data: &HashSet<String>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create dir {}: {}", parent.display(), error))?;
    }

    let mut values = data.iter().cloned().collect::<Vec<_>>();
    values.sort();
    let raw = serde_json::to_string_pretty(&values)
        .map_err(|error| format!("failed to serialize json {}: {}", path.display(), error))?;
    fs::write(path, raw).map_err(|error| format!("failed to write {}: {}", path.display(), error))
}
