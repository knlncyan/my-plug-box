use std::collections::HashMap;

use crate::core::{
    ApiResponse, CommandMeta, PluginActivation, PluginContext, PluginEntry, PluginManifest,
    PluginStatus, PluginSummary,
};

pub trait PluginManagerActivation {
    fn register_builtin<T: PluginActivation + Send + 'static>(
        &mut self,
        manifest: PluginManifest,
        module: T,
    ) -> Result<ApiResponse<()>, String>;
    fn register_command(&mut self, cmd: CommandMeta) -> Result<ApiResponse<()>, String>;
    fn activate_by_id(&mut self, plugin_id: &str) -> Result<ApiResponse<()>, String>;
    fn deactivate(&mut self, plugin_id: &str) -> Result<ApiResponse<()>, String>;
    fn disable(&mut self, plugin_id: &str) -> Result<ApiResponse<()>, String>;
}

pub struct PluginManager {
    _plugins: HashMap<String, PluginEntry>,
    _contexts: HashMap<String, PluginContext>,
    _global_views: HashMap<String, String>,
    _global_commands: HashMap<String, String>,
}

impl PluginManager {
    pub fn new() -> Self {
        PluginManager {
            _plugins: HashMap::new(),
            _contexts: HashMap::new(),
            _global_views: HashMap::new(),
            _global_commands: HashMap::new(),
        }
    }

    pub fn contains_plugin(&self, plugin_id: &str) -> bool {
        self._plugins.contains_key(plugin_id)
    }

    fn status_label(status: &PluginStatus) -> &'static str {
        match status {
            PluginStatus::Registered => "registered",
            PluginStatus::Activating => "activating",
            PluginStatus::Activated => "activated",
            PluginStatus::Deactivating => "deactivating",
            PluginStatus::Inactive => "inactive",
            PluginStatus::Disabled => "disabled",
            PluginStatus::Error(_) => "error",
        }
    }

    fn status_error(status: &PluginStatus) -> Option<String> {
        match status {
            PluginStatus::Error(message) => Some(message.clone()),
            _ => None,
        }
    }

    fn activate_single(
        entry: &mut PluginEntry,
        contexts: &mut HashMap<String, PluginContext>,
    ) -> Result<ApiResponse<()>, String> {
        if entry.status == PluginStatus::Disabled {
            return Ok(ApiResponse::warning(format!(
                "plugin {} is disabled",
                entry.manifest.id
            )));
        }

        if entry.status == PluginStatus::Activated {
            return Ok(ApiResponse::warning(format!(
                "plugin {} is already activated",
                entry.manifest.id
            )));
        }

        let id = entry.manifest.id.clone();
        let module = entry.module.as_ref();

        entry.status = PluginStatus::Activating;

        let context = PluginContext {
            plugin_id: id.clone(),
        };

        match module.activate(&context) {
            Ok(_) => {
                entry.status = PluginStatus::Activated;
                contexts.insert(id.clone(), context);
                Ok(ApiResponse::ok())
            }
            Err(e) => {
                entry.status = PluginStatus::Error(e.clone());
                Err(e)
            }
        }
    }

    pub fn list_plugins(&self) -> Vec<PluginSummary> {
        self._plugins
            .iter()
            .map(|(id, entry)| {
                PluginSummary {
                    id: id.clone(),
                    name: entry.manifest.name.clone(),
                    version: entry.manifest.version.clone(),
                    status: Self::status_label(&entry.status).to_string(),
                    icon: entry.manifest.icon.clone(),
                    error: Self::status_error(&entry.status),
                    description: entry.manifest.description.clone(),
                    view: entry.manifest.view.clone(),
                }
            })
            .collect()
    }

    pub fn get_all_commands(&self) -> Vec<CommandMeta> {
        self._plugins
            .values()
            .flat_map(|entry| entry.registered_commands.clone())
            .collect()
    }
}

impl PluginManagerActivation for PluginManager {
    fn register_builtin<T: PluginActivation + Send + 'static>(
        &mut self,
        manifest: PluginManifest,
        module: T,
    ) -> Result<ApiResponse<()>, String> {
        if self._plugins.contains_key(&manifest.id) {
            return Ok(ApiResponse::warning(format!(
                "plugin {} already exists",
                manifest.id
            )));
        }

        let entry = PluginEntry {
            manifest: manifest.clone(),
            status: PluginStatus::Registered,
            module: Box::new(module),
            registered_commands: Vec::new(),
        };

        self._plugins.insert(manifest.id.clone(), entry);

        Ok(ApiResponse::success(
            (),
            format!("plugin {} registered", manifest.id),
        ))
    }

    fn register_command(&mut self, cmd: CommandMeta) -> Result<ApiResponse<()>, String> {
        let plugin_id = cmd.plugin_id.clone();
        let command_id = cmd.id.clone();

        if !self._plugins.contains_key(&plugin_id) {
            return Err(format!(
                "plugin {} not found, cannot register command",
                plugin_id
            ));
        }

        if let Some(owner_plugin_id) = self._global_commands.get(&command_id) {
            if owner_plugin_id != &plugin_id {
                return Ok(ApiResponse::warning(format!(
                    "command id {} already belongs to plugin {}",
                    command_id, owner_plugin_id
                )));
            }
            return Ok(ApiResponse::warning(format!(
                "command id {} already registered in plugin {}",
                command_id, plugin_id
            )));
        }

        let entry = self
            ._plugins
            .get_mut(&plugin_id)
            .ok_or_else(|| format!("plugin {} not found", plugin_id))?;

        if entry.registered_commands.iter().any(|c| c.id == command_id) {
            return Ok(ApiResponse::warning(format!(
                "command id {} already registered in plugin {}",
                command_id, plugin_id
            )));
        }

        entry.registered_commands.push(cmd);
        self._global_commands.insert(command_id, plugin_id);

        Ok(ApiResponse::ok())
    }

    fn activate_by_id(&mut self, plugin_id: &str) -> Result<ApiResponse<()>, String> {
        let entry = self
            ._plugins
            .get_mut(plugin_id)
            .ok_or_else(|| format!("plugin {} not found", plugin_id))?;

        Self::activate_single(entry, &mut self._contexts)
    }

    fn deactivate(&mut self, plugin_id: &str) -> Result<ApiResponse<()>, String> {
        let entry = self
            ._plugins
            .get_mut(plugin_id)
            .ok_or_else(|| format!("plugin {} not found", plugin_id))?;

        if entry.status == PluginStatus::Disabled {
            return Ok(ApiResponse::warning(format!(
                "plugin {} is disabled",
                plugin_id
            )));
        }

        if entry.status != PluginStatus::Activated {
            return Ok(ApiResponse::warning(format!(
                "plugin {} is not activated",
                plugin_id
            )));
        }

        let _ = entry.module.deactivate();
        entry.status = PluginStatus::Inactive;

        self._contexts.remove(plugin_id);

        Ok(ApiResponse::ok())
    }

    fn disable(&mut self, plugin_id: &str) -> Result<ApiResponse<()>, String> {
        let entry = self
            ._plugins
            .get_mut(plugin_id)
            .ok_or_else(|| format!("plugin {} not found", plugin_id))?;

        if entry.status == PluginStatus::Disabled {
            return Ok(ApiResponse::warning(format!(
                "plugin {} is already disabled",
                plugin_id
            )));
        }

        if entry.status == PluginStatus::Activated {
            let _ = entry.module.deactivate();
            self._contexts.remove(plugin_id);
        }

        entry.status = PluginStatus::Disabled;

        Ok(ApiResponse::ok())
    }
}
