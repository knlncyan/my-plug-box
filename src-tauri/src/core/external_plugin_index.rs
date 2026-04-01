use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalPluginViewManifestDto {
    pub id: String,
    pub title: String,
    // #[serde(default, rename = "pluginId")]
    // pub plugin_id: String,
    #[serde(default)]
    pub props: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalPluginCommandDto {
    pub id: String,
    pub description: String,
    #[serde(default)]
    pub shortcut: Option<String>,
    #[serde(default, rename = "shortcutScope")]
    pub shortcut_scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalPluginManifestDto {
    pub id: String,
    pub name: String,
    pub version: String,
    pub icon: Option<String>,
    pub description: Option<String>,
    #[serde(default, rename = "activationEvents")]
    pub activation_events: Vec<String>,
    pub view: Option<ExternalPluginViewManifestDto>,
    #[serde(default)]
    pub commands: Vec<ExternalPluginCommandDto>,
    #[serde(default, rename = "moduleUrl")]
    pub module_url: Option<String>,
    #[serde(default, rename = "viewUrl")]
    pub view_url: Option<String>,
}

fn read_manifest_file(path: &Path) -> Result<ExternalPluginManifestDto, String> {
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("failed to read {}: {}", path.display(), error))?;

    // 兼容 UTF-8 BOM，避免 plugin.json 在 Windows 编辑器下保存后解析失败。
    let normalized = raw.trim_start_matches('\u{feff}');

    serde_json::from_str::<ExternalPluginManifestDto>(normalized)
        .map_err(|error| format!("failed to parse {}: {}", path.display(), error))
}

fn build_asset_import_url(path: &Path) -> String {
    if cfg!(target_os = "windows") {
        format!("http://asset.localhost/{}", path.to_string_lossy())
    } else {
        format!("asset://localhost/{}", path.to_string_lossy())
    }
}

fn clean_path(s: &str) -> &str {
    s.trim_start_matches('/').trim_start_matches('\\')
}

fn normalize_manifest(
    mut manifest: ExternalPluginManifestDto,
    app_data_dir: &Path,
    plugin_dir: &Path,
) -> ExternalPluginManifestDto {
    let module_path = match manifest.module_url {
        Some(url) => app_data_dir.join(clean_path(&url)),
        None => plugin_dir.join("index.js"),
    };

    manifest.module_url = Some(build_asset_import_url(&module_path));

    if manifest.view.is_some() {
        let view_path = match manifest.view_url {
            Some(url) => app_data_dir.join(clean_path(&url)),
            None => plugin_dir.join("view/index.js"),
        };

        manifest.view_url = Some(build_asset_import_url(&view_path));
    }

    manifest
}

pub fn scan_external_plugin_manifests(
    app: AppHandle,
) -> Result<Vec<ExternalPluginManifestDto>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let root = app_data_dir.join("plugins");
    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut manifests = Vec::new();

    let entries = fs::read_dir(&root)
        .map_err(|error| format!("failed to read plugin root {}: {}", root.display(), error))?;

    for entry in entries {
        let entry =
            entry.map_err(|error| format!("failed to read plugin directory entry: {}", error))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        if path.file_name().and_then(|name| name.to_str()).is_none() {
            continue;
        }

        let manifest_path = path.join("plugin.json");
        if !manifest_path.exists() {
            continue;
        }

        let manifest = read_manifest_file(&manifest_path)?;
        manifests.push(normalize_manifest(manifest, &app_data_dir, &path));
    }

    manifests.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(manifests)
}
