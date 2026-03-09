use std::collections::HashMap;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

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
    // fn register_view(&mut self, view: ViewMeta) -> Result<ApiResponse<()>, String>;
    fn register_command(&mut self, cmd: CommandMeta) -> Result<ApiResponse<()>, String>;
    fn activate_all(&mut self) -> Result<ApiResponse<()>, String>;
    fn deactivate(&mut self, plugin_id: &String) -> Result<ApiResponse<()>, String>;
}

pub struct PluginManager {
    _plugins: HashMap<String, PluginEntry>,
    _contexts: HashMap<String, PluginContext>,
    // Global uniqueness indexes: id -> owner_plugin_id
    _global_views: HashMap<String, String>,
    _global_commands: HashMap<String, String>,
    app_handle: Option<AppHandle>,
}

impl PluginManager {
    pub fn new() -> Self {
        PluginManager {
            _plugins: HashMap::new(),
            _contexts: HashMap::new(),
            _global_views: HashMap::new(),
            _global_commands: HashMap::new(),
            app_handle: None,
        }
    }

    fn emit_event(&self, event: &str, payload: impl Serialize + Clone) {
        if let Some(handle) = &self.app_handle {
            let _ = handle.emit(event, payload);
        }
    }

    fn emit_plugin_status(&self, plugin_id: &str, status: PluginStatus) {
        self.emit_event(
            "plugin-status-changed",
            serde_json::json!({
                "id": plugin_id,
                "status": status
            }),
        );
    }

    pub fn set_app_handle(&mut self, handle: AppHandle) {
        self.app_handle = Some(handle);
    }

    fn activate_single(
        entry: &mut PluginEntry,
        contexts: &mut HashMap<String, PluginContext>,
        emitter: &Option<AppHandle>,
    ) -> Result<ApiResponse<()>, String> {
        if entry.status == PluginStatus::Activated {
            return Ok(ApiResponse::warning(format!(
                "plugin {} is already activated",
                entry.manifest.id
            )));
        }

        let id = entry.manifest.id.clone();
        let module = entry.module.as_ref();

        entry.status = PluginStatus::Activating;

        if let Some(h) = emitter {
            let _ = h.emit(
                "plugin-status-changed",
                serde_json::json!({"id": id, "status": PluginStatus::Activating}),
            );
        }

        let context = PluginContext {
            plugin_id: id.clone(),
        };

        match module.activate(&context) {
            Ok(_) => {
                entry.status = PluginStatus::Activated;
                contexts.insert(id.clone(), context);

                if let Some(h) = emitter {
                    let _ = h.emit(
                        "plugin-status-changed",
                        serde_json::json!({"id": id, "status": PluginStatus::Activated}),
                    );
                }
                Ok(ApiResponse::ok())
            }
            Err(e) => {
                entry.status = PluginStatus::Error(e.clone());
                if let Some(h) = emitter {
                    let _ = h.emit(
                        "plugin-status-changed",
                        serde_json::json!({"id": id, "status": PluginStatus::Error(e.clone()), "error": e}),
                    );
                }
                Err(e)
            }
        }
    }

    pub fn activate_by_id(&mut self, plugin_id: &str) -> Result<ApiResponse<()>, String> {
        let entry = self
            ._plugins
            .get_mut(plugin_id)
            .ok_or_else(|| format!("plugin {} not found", plugin_id))?;

        Self::activate_single(entry, &mut self._contexts, &self.app_handle)
    }

    pub fn list_plugins(&self) -> Vec<PluginSummary> {
        self._plugins
            .iter()
            .map(|(id, entry)| {
                let error_msg = match &entry.status {
                    PluginStatus::Error(msg) => Some(msg.clone()),
                    _ => None,
                };
                PluginSummary {
                    id: id.clone(),
                    name: entry.manifest.name.clone(),
                    version: entry.manifest.version.clone(),
                    status: format!("{:?}", entry.status),
                    error: error_msg,
                    description: entry.manifest.description.clone(),
                    view: entry.manifest.view.clone()
                }
            })
            .collect()
    }

    // pub fn get_all_views(&self) -> Vec<ViewMeta> {
    //     self._plugins
    //         .values()
    //         .map(|entry| entry.registered_views.clone())
    //         .collect()
    // }

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
        self.emit_plugin_status(&manifest.id, PluginStatus::Registered);

        Ok(ApiResponse::success(
            (),
            format!("plugin {} registered", manifest.id),
        ))
    }

    // fn register_view(&mut self, view: ViewMeta) -> Result<ApiResponse<()>, String> {
    //     let plugin_id = view.plugin_id.clone();
    //     let view_id = view.id.clone();

    //     if !self._plugins.contains_key(&plugin_id) {
    //         return Err(format!(
    //             "plugin {} not found, cannot register view",
    //             plugin_id
    //         ));
    //     }

    //     if let Some(owner_plugin_id) = self._global_views.get(&view_id) {
    //         if owner_plugin_id != &plugin_id {
    //             return Ok(ApiResponse::conflict(format!(
    //                 "view id {} already belongs to plugin {}",
    //                 view_id, owner_plugin_id
    //             )));
    //         }
    //         return Ok(ApiResponse::warning(format!(
    //             "view id {} already registered in plugin {}",
    //             view_id, plugin_id
    //         )));
    //     }

    //     let entry = self
    //         ._plugins
    //         .get_mut(&plugin_id)
    //         .ok_or_else(|| format!("plugin {} not found", plugin_id))?;

    //     if entry.registered_views.iter().any(|v| v.id == view_id) {
    //         return Ok(ApiResponse::warning(format!(
    //             "view id {} already registered in plugin {}",
    //             view_id, plugin_id
    //         )));
    //     }

    //     entry.registered_views = Some(view);
    //     self._global_views.insert(view_id, plugin_id);

    //     self.emit_event("views-registered", serde_json::json!({}));
    //     Ok(ApiResponse::ok())
    // }

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
                return Ok(ApiResponse::conflict(format!(
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

    fn activate_all(&mut self) -> Result<ApiResponse<()>, String> {
        let mut errors = Vec::new();
        let mut count = 0;

        for (id, entry) in self._plugins.iter_mut() {
            if entry.status == PluginStatus::Registered {
                match Self::activate_single(entry, &mut self._contexts, &self.app_handle) {
                    Ok(_) => count += 1,
                    Err(e) => {
                        eprintln!("plugin {} activate failed: {}", id, e);
                        errors.push(format!("{}: {}", id, e));
                    }
                }
            }
        }

        if !errors.is_empty() {
            return Err(format!(
                "{} succeeded, {} failed:\n{}",
                count,
                errors.len(),
                errors.join("\n")
            ));
        }

        Ok(ApiResponse::ok())
    }

    fn deactivate(&mut self, plugin_id: &String) -> Result<ApiResponse<()>, String> {
        let command_ids = {
            let entry = self
                ._plugins
                .get_mut(plugin_id)
                .ok_or_else(|| format!("plugin {} not found", plugin_id))?;

            if entry.status != PluginStatus::Activated {
                return Ok(ApiResponse::warning(format!(
                    "plugin {} is not activated",
                    plugin_id
                )));
            }

            let _ = entry.module.deactivate();

            // let view_ids = entry
            //     .registered_views
            //     .iter()
            //     .map(|v| v.id.clone())
            //     .collect::<Vec<_>>();
            let command_ids = entry
                .registered_commands
                .iter()
                .map(|c| c.id.clone())
                .collect::<Vec<_>>();

            // entry.registered_views.clear();
            entry.registered_commands.clear();
            entry.status = PluginStatus::Inactive;

            command_ids
        };

        self._contexts.remove(plugin_id);

        // for view_id in view_ids {
        //     if matches!(self._global_views.get(&view_id), Some(owner) if owner == plugin_id) {
        //         self._global_views.remove(&view_id);
        //     }
        // }

        for command_id in command_ids {
            if matches!(
                self._global_commands.get(&command_id),
                Some(owner) if owner == plugin_id
            ) {
                self._global_commands.remove(&command_id);
            }
        }

        self.emit_plugin_status(plugin_id, PluginStatus::Inactive);
        self.emit_event("views-registered", serde_json::json!({}));

        Ok(ApiResponse::ok())
    }
}
