use crate::core::{CommandMeta, PluginContext, ViewMeta};
use serde::{Deserialize, Serialize};

/**
 * 插件的静态数据
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
}

/**
 * 插件必须实现的方法,一些生命周期钩子，不要在这里管理状态
 */
pub trait PluginActivation {
    // 必须加 &self，否则无法访问插件内部状态
    fn activate(&self, context: &PluginContext) -> Result<(), String>;
    fn deactivate(&self) -> Result<(), String>;
}

// 插件状态枚举类
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PluginStatus {
    Registered,
    Activating,
    Activated,
    Deactivating,
    Inactive,
    Error(String),
}

/**
 * 插件实体信息
 */
pub struct PluginEntry {
    // 静态数据
    pub manifest: PluginManifest,
    // 状态
    pub status: PluginStatus,
    // 生命周期钩子
    pub module: Box<dyn PluginActivation + Send>,
    // 注册的视图
    pub registered_views: Vec<ViewMeta>,
    // 注册的命令
    pub registered_commands: Vec<CommandMeta>,
    pub bridge_id: Option<String>,
}
