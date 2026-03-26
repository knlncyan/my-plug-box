use crate::core::{CommandMeta, JsPluginAdapter, PluginManager, PluginManagerActivation, PluginManifest, PluginViewManifest};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalPluginViewManifestDto {
    pub id: String,
    pub title: String,
    #[serde(default, rename = "pluginId")]
    pub plugin_id: String,
    #[serde(default)]
    pub props: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalPluginCommandDto {
    pub id: String,
    pub description: String,
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

fn resolve_external_plugins_root() -> Result<PathBuf, String> {
    let cwd = std::env::current_dir()
        .map_err(|error| format!("failed to resolve current dir: {}", error))?;

    let candidates = vec![
        cwd.join("plugins"),
        cwd.join("public").join("plugins"),
        cwd.parent()
            .map(|it| it.join("plugins"))
            .unwrap_or_else(|| cwd.join("plugins")),
        cwd.parent()
            .map(|it| it.join("public").join("plugins"))
            .unwrap_or_else(|| cwd.join("public").join("plugins")),
    ];

    for root in candidates {
        if root.exists() {
            return Ok(root);
        }
    }

    Ok(cwd.join("plugins"))
}

fn read_manifest_file(path: &Path) -> Result<ExternalPluginManifestDto, String> {
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("failed to read {}: {}", path.display(), error))?;

    // 兼容 UTF-8 BOM 文件头，避免 Windows 编辑器保存后解析失败。
    let normalized = raw.trim_start_matches('\u{feff}');

    serde_json::from_str::<ExternalPluginManifestDto>(normalized)
        .map_err(|error| format!("failed to parse {}: {}", path.display(), error))
}

fn normalize_manifest(
    mut manifest: ExternalPluginManifestDto,
    folder_name: &str,
) -> ExternalPluginManifestDto {
    if manifest.module_url.is_none() {
        manifest.module_url = Some(format!("/plugins/{}/index.js", folder_name));
    }

    if manifest.view.is_some() && manifest.view_url.is_none() {
        manifest.view_url = Some(format!("/plugins/{}/view/index.js", folder_name));
    }

    if let Some(view) = manifest.view.as_mut() {
        if view.plugin_id.trim().is_empty() {
            view.plugin_id = manifest.id.clone();
        }
    }

    manifest
}

pub fn scan_external_plugin_manifests() -> Result<Vec<ExternalPluginManifestDto>, String> {
    let root = resolve_external_plugins_root()?;
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

        let folder_name = match path.file_name().and_then(|name| name.to_str()) {
            Some(name) if !name.is_empty() => name,
            _ => continue,
        };

        let manifest_path = path.join("plugin.json");
        if !manifest_path.exists() {
            continue;
        }

        let manifest = read_manifest_file(&manifest_path)?;
        manifests.push(normalize_manifest(manifest, folder_name));
    }

    manifests.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(manifests)
}

fn to_core_manifest(manifest: &ExternalPluginManifestDto) -> PluginManifest {
    PluginManifest {
        id: manifest.id.clone(),
        name: manifest.name.clone(),
        version: manifest.version.clone(),
        icon: manifest.icon.clone(),
        description: manifest.description.clone(),
        activation_events: manifest.activation_events.clone(),
        view: manifest.view.as_ref().map(|view| PluginViewManifest {
            id: view.id.clone(),
            title: view.title.clone(),
            plugin_id: if view.plugin_id.trim().is_empty() {
                manifest.id.clone()
            } else {
                view.plugin_id.clone()
            },
            props: view.props.clone(),
        }),
    }
}

pub fn register_external_manifests(
    manager: &mut PluginManager,
    manifests: &[ExternalPluginManifestDto],
) -> Result<(), String> {
    for manifest in manifests {
        let plugin_id = manifest.id.clone();
        if manager.contains_plugin(&plugin_id) {
            // 仅新增未注册插件，不改变已管理插件的状态。
            continue;
        }

        let core_manifest = to_core_manifest(manifest);
        let module = JsPluginAdapter::new(plugin_id.clone());

        // 重复注册会返回 warning，这里忽略 warning，保持幂等。
        let _ = manager.register_builtin(core_manifest, module)?;

        for command in &manifest.commands {
            let _ = manager.register_command(CommandMeta {
                id: command.id.clone(),
                description: command.description.clone(),
                plugin_id: plugin_id.clone(),
            })?;
        }
    }

    Ok(())
}
