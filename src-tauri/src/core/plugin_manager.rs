use std::collections::{HashMap, HashSet};

use crate::{
    core::{
        plugin_index_utils::ExternalPluginManifestDto, CommandMeta, PluginEntry, PluginManifest,
        PluginStatus, ViewMeta,
    },
    utils::ApiResponse,
};

pub trait PluginManagerActivation {
    fn register(&mut self, plugin_dtos: Vec<ExternalPluginManifestDto>, disabled_plugin_ids: &HashSet<String>) -> Result<(), String>;
    fn activate(&mut self, plugin_id: &str) -> ApiResponse<()>;
    fn deactivate(&mut self, plugin_id: &str) -> ApiResponse<()>;
    fn disable(&mut self, plugin_id: &str) -> ApiResponse<()>;
    fn enable(&mut self, plugin_id: &str) -> ApiResponse<()>;
}

pub struct PluginManager {
    _plugins: HashMap<String, PluginEntry>,
    // _contexts: HashMap<String, PluginContext>,
    // _global_views: HashMap<String, String>,
    // _global_commands: HashMap<String, String>,
}

impl PluginManager {
    pub fn new() -> Self {
        PluginManager {
            _plugins: HashMap::new(),
            // _contexts: HashMap::new(),
            // _global_views: HashMap::new(),
            // _global_commands: HashMap::new(),
        }
    }

    // pub fn contains_plugin(&self, plugin_id: &str) -> bool {
    //     self._plugins.contains_key(plugin_id)
    // }

    // fn status_label(status: &PluginStatus) -> &'static str {
    //     match status {
    //         PluginStatus::Registered => "registered",
    //         PluginStatus::Activating => "activating",
    //         PluginStatus::Activated => "activated",
    //         PluginStatus::Deactivating => "deactivating",
    //         PluginStatus::Inactive => "inactive",
    //         PluginStatus::Disabled => "disabled",
    //         PluginStatus::Error(_) => "error",
    //     }
    // }

    // fn status_error(status: &PluginStatus) -> Option<String> {
    //     match status {
    //         PluginStatus::Error(message) => Some(message.clone()),
    //         _ => None,
    //     }
    // }

    fn activate_single(entry: &mut PluginEntry) -> Result<(), String> {
        if entry.status == PluginStatus::Disabled {
            return Err(format!("plugin {} is disabled", entry.manifest.id));
        }

        if entry.status == PluginStatus::Activated {
            return Ok(());
        }

        entry.status = PluginStatus::Activated;

        Ok(())
    }

    pub fn list_plugins_runtime(&self) -> Vec<PluginEntry> {
        self._plugins.values().cloned().collect()
    }

    pub fn lise_plugins_commands(&self) -> Vec<CommandMeta> {
        self._plugins
            .values()
            .filter(|it| it.status != PluginStatus::Disabled)
            .flat_map(|it| it.commands_meta.clone())
            .collect()
    }

    pub fn restore_runtime(&mut self, entries: Vec<PluginEntry>) {
        self._plugins.clear();
        for entry in entries {
            self._plugins.insert(entry.plugin_id.clone(), entry);
        }
    }
}

impl PluginManagerActivation for PluginManager {
    // 注意：这里去掉了 Vec 的引用，直接消费它
    fn register(&mut self, plugin_dtos: Vec<ExternalPluginManifestDto>, disabled_plugin_ids: &HashSet<String>) -> Result<(), String> {
        self._plugins.clear();
        for dto in plugin_dtos {
            // 如果已存在，跳过
            // if self._plugins.contains_key(&dto.id) {
            //     continue;
            // }

            if !dto.module_url.as_ref().is_some_and(|s| !s.is_empty()) {
                println!("插件 '{}' 缺少必需的 module_url", dto.id);
                continue;
            }
            if dto.view.as_ref().is_some() && dto.view_url.as_ref().is_none_or(|s| s.is_empty()) {
                println!("插件 '{}' 缺少必需的 view_url", dto.id);
                continue;
            }
            let module_url = dto.module_url.unwrap_or_default();
            let view_url = dto.view_url.unwrap_or_default();

            let plugin_id = dto.id.clone(); // 这里还是需要 clone 一次作为 key

            // 直接移动字段，不需要 clone
            let view_meta = dto.view.map(|it| ViewMeta {
                id: it.id,
                title: it.title,
                plugin_id: plugin_id.clone(),
                props: it.props,
            });

            let commands_meta = dto
                .commands
                .into_iter()
                .map(|it| CommandMeta {
                    id: it.id,
                    description: it.description,
                    plugin_id: plugin_id.clone(),
                    shortcut: it.shortcut,
                    shortcut_scope: it.shortcut_scope,
                })
                .collect();

            let entry = PluginEntry {
                plugin_id: plugin_id.clone(),
                manifest: PluginManifest {
                    id: plugin_id.clone(),
                    name: dto.name,
                    version: dto.version,
                    icon: dto.icon,
                    description: dto.description,
                    activation_events: dto.activation_events,
                },
                view_meta,
                commands_meta,
                status: if disabled_plugin_ids.contains(&plugin_id) {
                    PluginStatus::Disabled
                } else {
                    PluginStatus::Registered
                },
                module_url: module_url,
                view_url: view_url,
            };

            self._plugins.insert(plugin_id, entry);
        }
        Ok(())
    }

    fn activate(&mut self, plugin_id: &str) -> ApiResponse<()> {
        // 1. 先获取 Option
        let entry = self._plugins.get_mut(plugin_id);

        // 2. 手动匹配
        if let Some(e) = entry {
            match Self::activate_single(e) {
                Ok(_) => ApiResponse::ok(),
                Err(error) => ApiResponse::error(error),
            }
        } else {
            ApiResponse::error(format!("plugin {} not found", plugin_id))
        }
    }

    fn deactivate(&mut self, plugin_id: &str) -> ApiResponse<()> {
        let entry = self._plugins.get_mut(plugin_id);

        if let Some(e) = entry {
            if e.status == PluginStatus::Disabled {
                return ApiResponse::warning(format!("plugin {} is disabled", plugin_id));
            }

            if e.status != PluginStatus::Activated {
                return ApiResponse::warning(format!("plugin {} is not activated", plugin_id));
            }

            e.status = PluginStatus::Inactive;

            ApiResponse::ok()
        } else {
            ApiResponse::error(format!("plugin {} not found", plugin_id))
        }
    }

    fn disable(&mut self, plugin_id: &str) -> ApiResponse<()> {
        let entry = self._plugins.get_mut(plugin_id);
        // .ok_or_else(|| format!("plugin {} not found", plugin_id))?;
        if let Some(e) = entry {
            if e.status == PluginStatus::Disabled {
                return ApiResponse::warning(format!("plugin {} is already disabled", plugin_id));
            }

            e.status = PluginStatus::Disabled;

            ApiResponse::ok()
        } else {
            ApiResponse::error(format!("plugin {} not found", plugin_id))
        }
    }

    fn enable(&mut self, plugin_id: &str) -> ApiResponse<()> {
        let entry = self._plugins.get_mut(plugin_id);

        if let Some(e) = entry {
            if e.status != PluginStatus::Disabled {
                return ApiResponse::warning(format!("plugin {} is not disabled", plugin_id));
            }

            e.status = PluginStatus::Registered;

            ApiResponse::ok()
        } else {
            ApiResponse::error(format!("plugin {} not found", plugin_id))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{ExternalPluginManifestDto, PluginManager, PluginManagerActivation, PluginStatus};
    use std::collections::HashSet;

    fn make_manifest(id: &str, command_id: &str) -> ExternalPluginManifestDto {
        ExternalPluginManifestDto {
            id: id.to_string(),
            name: format!("{} name", id),
            version: "1.0.0".to_string(),
            icon: None,
            description: Some(format!("{} description", id)),
            activation_events: vec![format!("onCommand:{}", command_id)],
            view: None,
            commands: vec![super::super::plugin_index_utils::ExternalPluginCommandDto {
                id: command_id.to_string(),
                description: format!("{} description", command_id),
                shortcut: None,
                shortcut_scope: None,
            }],
            module_url: Some(format!("/plugins/{}/index.js", id)),
            view_url: None,
        }
    }

    #[test]
    fn register_applies_disabled_status_from_persisted_ids() {
        let mut manager = PluginManager::new();
        let mut disabled = HashSet::new();
        disabled.insert("external.disabled".to_string());

        manager
            .register(vec![make_manifest("external.disabled", "external.disabled.open")], &disabled)
            .expect("register should succeed");

        let entries = manager.list_plugins_runtime();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].plugin_id, "external.disabled");
        assert_eq!(entries[0].status, PluginStatus::Disabled);
    }

    #[test]
    fn command_export_skips_disabled_plugins() {
        let mut manager = PluginManager::new();
        let mut disabled = HashSet::new();
        disabled.insert("external.disabled".to_string());

        manager
            .register(
                vec![
                    make_manifest("external.enabled", "external.enabled.open"),
                    make_manifest("external.disabled", "external.disabled.open"),
                ],
                &disabled,
            )
            .expect("register should succeed");

        let commands = manager.lise_plugins_commands();
        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].plugin_id, "external.enabled");
    }

    #[test]
    fn enable_transitions_disabled_plugin_back_to_registered() {
        let mut manager = PluginManager::new();
        let mut disabled = HashSet::new();
        disabled.insert("external.disabled".to_string());

        manager
            .register(vec![make_manifest("external.disabled", "external.disabled.open")], &disabled)
            .expect("register should succeed");

        let response = manager.enable("external.disabled");
        assert!(response.success);

        let entries = manager.list_plugins_runtime();
        assert_eq!(entries[0].status, PluginStatus::Registered);
    }
}
