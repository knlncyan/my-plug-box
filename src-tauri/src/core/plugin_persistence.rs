/// 插件持久化存储模块（JSON 文件实现）。
/// 设计约束：
/// 1) settings：单文件存储，键格式为 `pluginId.key`。
/// 2) storage：按插件分文件存储，文件名由插件 ID 安全转换得到。
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

/// 读取整个settings。
pub fn read_all_plugin_settings() -> Result<Map<String, Value>, String> {
    let path = settings_file_path()?;
    read_json_object(&path)
}

/// 写入某个插件单个 settings 项。
pub fn write_plugin_setting(plugin_id: &str, key: &str, value: Value) -> Result<(), String> {
    let scoped_key = format!("{}.{}", plugin_id, key);
    let path = settings_file_path()?;
    let mut data = read_json_object(&path)?;
    data.insert(scoped_key, value);
    write_json_object(&path, &data)
}

/// 读取某个插件 storage 快照。
pub fn read_plugin_storage_snapshot(plugin_id: &str) -> Result<Map<String, Value>, String> {
    let path = plugin_storage_file_path(plugin_id)?;
    read_json_object(&path)
}

/// 写入某个插件 storage 键值。
pub fn write_plugin_storage_value(plugin_id: &str, key: &str, value: Value) -> Result<(), String> {
    let path = plugin_storage_file_path(plugin_id)?;
    let mut data = read_json_object(&path)?;
    data.insert(key.to_string(), value);
    write_json_object(&path, &data)
}

fn persistence_root() -> Result<PathBuf, String> {
    let mut root = std::env::current_dir()
        .map_err(|error| format!("failed to resolve current dir: {}", error))?;
    root.push(".plug-box-data");
    root.push("plugin-persistence");
    Ok(root)
}

fn settings_file_path() -> Result<PathBuf, String> {
    let mut path = persistence_root()?;
    path.push("settings.json");
    Ok(path)
}

fn plugin_storage_file_path(plugin_id: &str) -> Result<PathBuf, String> {
    let mut path = persistence_root()?;
    path.push("storage");
    path.push(format!("{}.json", sanitize_plugin_id(plugin_id)));
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

fn write_json_object(path: &Path, data: &Map<String, Value>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create dir {}: {}", parent.display(), error))?;
    }

    let raw = serde_json::to_string_pretty(data)
        .map_err(|error| format!("failed to serialize json {}: {}", path.display(), error))?;
    fs::write(path, raw).map_err(|error| format!("failed to write {}: {}", path.display(), error))
}
