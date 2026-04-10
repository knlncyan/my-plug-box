use std::collections::HashMap;

use crate::{
    core::{
        plugin_index_utils::ExternalPluginManifestDto, CommandMeta, PluginEntry, PluginManifest,
        PluginStatus, ViewMeta,
    },
    utils::ApiResponse,
};

pub trait PluginManagerActivation {
    fn register(&mut self, plugin_dtos: Vec<ExternalPluginManifestDto>) -> Result<(), String>;
    fn activate(&mut self, plugin_id: &str) -> ApiResponse<()>;
    fn deactivate(&mut self, plugin_id: &str) -> ApiResponse<()>;
    fn disable(&mut self, plugin_id: &str) -> ApiResponse<()>;
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
            .flat_map(|it| it.commands_meta.clone())
            .collect()
    }
}

impl PluginManagerActivation for PluginManager {
    // 注意：这里去掉了 Vec 的引用，直接消费它
    fn register(&mut self, plugin_dtos: Vec<ExternalPluginManifestDto>) -> Result<(), String> {
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
                status: PluginStatus::Registered,
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
}
