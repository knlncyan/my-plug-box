/// Core plugin-domain models shared across command handlers and manager runtime.
use crate::core::PluginContext;
use serde::{Deserialize, Serialize};
use serde_json::Value;

// ==========================   一些插件元数据 =============================
/// 视图元数据：描述一个插件贡献的页面
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginViewManifest {
    pub id: String,    // 唯一 ID，如 "welcome.main"
    pub title: String, // 显示标题
    #[serde(default, rename = "pluginId")]
    pub plugin_id: String, // 归属插件 ID
    pub props: serde_json::Value, // 传递给组件的初始参数
}

/// 命令元数据：描述一个插件注册的命令
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandMeta {
    pub id: String,
    pub description: String,
    #[serde(default, rename = "pluginId")]
    pub plugin_id: String,
}

/// 插件简要信息 (用于列表展示)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginSummary {
    pub id: String,
    pub name: String,
    pub version: String,
    pub status: String, // "Registered", "Activated", "Error"
    pub icon: Option<String>,
    pub error: Option<String>,
    pub description: Option<String>,
    pub view: Option<PluginViewManifest>,
}

// ======================== 核心的插件数据结构 =============================
/**
 * 插件的静态数据
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub icon: Option<String>,
    pub description: Option<String>,
    #[serde(default, rename = "activationEvents")]
    pub activation_events: Vec<String>,
    pub view: Option<PluginViewManifest>,
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
    // 注册的命令
    pub registered_commands: Vec<CommandMeta>,
}

/**
 * 读取多个设置
 */
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SettingsDTO {
    pub key: String,
    pub value: Value,
}
