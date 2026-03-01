use std::collections::HashMap;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::core::{
    ApiResponse, CommandMeta, PluginActivation, PluginContext, PluginEntry, PluginManifest,
    PluginStatus, PluginSummary, ViewMeta,
};

pub trait PluginManagerActivation {
    fn register_builtin<T: PluginActivation + Send + 'static>(
        &mut self,
        mainfest: PluginManifest,
        module: T,
    ) -> Result<ApiResponse<()>, String>;
    fn register_view(&mut self, view: ViewMeta) -> Result<ApiResponse<()>, String>;
    fn register_command(&mut self, cmd: CommandMeta) -> Result<ApiResponse<()>, String>;
    fn activate_all(&mut self) -> Result<ApiResponse<()>, String>;
    fn deactivate(&mut self, plugin_id: &String) -> Result<ApiResponse<()>, String>;
}
pub struct PluginManager {
    _plugins: HashMap<String, PluginEntry>,
    _contexts: HashMap<String, PluginContext>,

    // 事件句柄，用于向前端发送事件
    app_handle: Option<AppHandle>,
    // _change_listeners: HashSet<String>,
}

impl PluginManager {
    // 构造方法
    pub fn new() -> Self {
        PluginManager {
            _plugins: HashMap::new(),
            _contexts: HashMap::new(),
            app_handle: None,
        }
    }

    // 辅助方法：发送状态变更事件
    fn emit_event(&self, event: &str, payload: impl Serialize + Clone) {
        if let Some(handle) = &self.app_handle {
            let _ = handle.emit(event, payload);
        }
    }

    // 辅助方法：发送插件状态变更
    fn emit_plugin_status(&self, plugin_id: &str, status: PluginStatus) {
        self.emit_event(
            "plugin-status-changed",
            serde_json::json!({
                "id": plugin_id,
                "status": status
            }),
        );
    }

    // 初始化时注入 AppHandle (必须在 main.rs 中调用)
    pub fn set_app_handle(&mut self, handle: AppHandle) {
        self.app_handle = Some(handle);
    }

    // 辅助方法：激活单个插件
    fn activate_single(
        entry: &mut PluginEntry,
        contexts: &mut HashMap<String, PluginContext>,
        emitter: &Option<AppHandle>, // 传入 emitter
    ) -> Result<ApiResponse<()>, String> {
        if entry.status == PluginStatus::Activated {
            return Ok(ApiResponse::warning(format!(
                "插件: {} 已激活",
                entry.manifest.id
            )));
        }

        let id = entry.manifest.id.clone();
        let module = entry.module.as_ref();

        entry.status = PluginStatus::Activating;

        // 发送事件：正在激活
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

                // 发送事件：激活成功
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
                // 发送事件：激活失败
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

    // 通过id激活卸载的插件
    pub fn activate_by_id(&mut self, plugin_id: &str) -> Result<ApiResponse<()>, String> {
        let entry = self
            ._plugins
            .get_mut(plugin_id)
            .ok_or_else(|| format!("插件 {} 不存在", plugin_id))?;

        // 复用内部的 activate_single
        Self::activate_single(entry, &mut self._contexts, &self.app_handle)
    }

    // 获取所有插件的摘要视图
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
                }
            })
            .collect()
    }

    // 获取所有注册的视图
    pub fn get_all_views(&self) -> Vec<ViewMeta> {
        self._plugins
            .values()
            .flat_map(|entry| entry.registered_views.clone())
            .collect()
    }

    // 获取所有注册的命令
    pub fn get_all_commands(&self) -> Vec<CommandMeta> {
        self._plugins
            .values()
            .flat_map(|entry| entry.registered_commands.clone())
            .collect()
    }
}

impl PluginManagerActivation for PluginManager {
    // 注册插件到插件管理器中
    fn register_builtin<T: PluginActivation + Send + 'static>(
        &mut self,
        manifest: PluginManifest,
        module: T,
    ) -> Result<ApiResponse<()>, String> {
        if self._plugins.contains_key(&manifest.id) {
            return Ok(ApiResponse::warning(format!(
                "[Manager] 插件 {} 已存在",
                manifest.id
            )));
        }

        let entry = PluginEntry {
            manifest: manifest.clone(),
            status: PluginStatus::Registered,
            module: Box::new(module),
            registered_views: Vec::new(),
            registered_commands: Vec::new(),
            bridge_id: None,
        };

        self._plugins.insert(manifest.id.clone(), entry);

        // 通知前端：新插件已注册
        self.emit_plugin_status(&manifest.id, PluginStatus::Registered);
        Ok(ApiResponse::success(
            (),
            format!("[Manager] 插件 {} 注册成功", manifest.id),
        ))
    }

    // 注册视图元数据
    fn register_view(&mut self, view: ViewMeta) -> Result<ApiResponse<()>, String> {
        let plugin_id = &view.plugin_id;

        // 1. 获取插件 Entry
        let entry = self
            ._plugins
            .get_mut(plugin_id)
            .ok_or_else(|| format!("插件 {} 不存在，无法注册视图", plugin_id))?;

        // 2. 检查 ID 是否在该插件内部重复
        if entry.registered_views.iter().any(|v| v.id == view.id) {
            return Ok(ApiResponse::warning(format!(
                "视图 ID {} 在此插件中已存在",
                view.id
            )));
        }

        // 3. 添加到插件内部的列表
        entry.registered_views.push(view);

        // 4. 通知前端刷新
        self.emit_event("views-registered", serde_json::json!({}));

        Ok(ApiResponse::ok())
    }

    // 注册命令元数据
    fn register_command(&mut self, cmd: CommandMeta) -> Result<ApiResponse<()>, String> {
        let plugin_id = &cmd.plugin_id;
        let entry = self
            ._plugins
            .get_mut(plugin_id)
            .ok_or_else(|| format!("插件 {} 不存在，无法注册命令", plugin_id))?;

        if entry.registered_commands.iter().any(|c| c.id == cmd.id) {
            return Ok(ApiResponse::warning(format!(
                "命令 ID {} 在此插件中已存在",
                cmd.id
            )));
        }

        entry.registered_commands.push(cmd);
        Ok(ApiResponse::ok())
    }

    // 修改 activate_all 以适配新的 activate_single 签名
    fn activate_all(&mut self) -> Result<ApiResponse<()>, String> {
        let mut errors = Vec::new();
        let mut count = 0;

        for (id, entry) in self._plugins.iter_mut() {
            if entry.status == PluginStatus::Registered {
                match Self::activate_single(entry, &mut self._contexts, &self.app_handle) {
                    Ok(_) => count += 1,
                    Err(e) => {
                        eprintln!("插件 {} 激活失败: {}", id, e);
                        errors.push(format!("{}: {}", id, e));
                    }
                }
            }
        }

        if !errors.is_empty() {
            return Err(format!(
                "{} 成功，{} 失败:\n{}",
                count,
                errors.len(),
                errors.join("\n")
            ));
        }
        Ok(ApiResponse::ok())
    }

    // 卸载插件
    fn deactivate(&mut self, plugin_id: &String) -> Result<ApiResponse<()>, String> {
        let entry = self
            ._plugins
            .get_mut(plugin_id)
            .ok_or_else(|| format!("插件 {} 不存在", plugin_id))?;

        if entry.status != PluginStatus::Activated {
            return Ok(ApiResponse::warning(format!("插件 {} 未激活", plugin_id)));
        }

        // 执行停用
        let _ = entry.module.deactivate(); // 忽略内部错误，强制清理

        // 清理资源
        self._contexts.remove(plugin_id);

        // 清理该插件注册的元数据 (可选：停用插件时是否移除其视图？通常应该移除)
        entry.registered_views.clear();
        entry.registered_commands.clear();

        // 更新状态
        entry.status = PluginStatus::Inactive;

        // 发送事件：已停用
        self.emit_plugin_status(plugin_id, PluginStatus::Inactive);
        // 通知视图列表变更
        self.emit_event("views-registered", serde_json::json!({}));

        Ok(ApiResponse::ok())
    }
}
