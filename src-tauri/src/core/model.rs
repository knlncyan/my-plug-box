/// 核心插件领域模型，供命令处理与运行时共享。
use serde::{Deserialize, Serialize};

fn system() -> String {
    "system".to_string()
}
// ========================== 一些插件元数据 =============================
/// 视图元数据：描述一个插件贡献的页面。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewMeta {
    pub id: String,    // 唯一 ID，如 "welcome.main"
    pub title: String, // 显示标题
    #[serde(default, rename = "pluginId")]
    pub plugin_id: String, // 归属插件 ID
    pub props: serde_json::Value, // 传递给组件的初始参数
}

/// 命令元数据：描述一个插件注册的命令。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandMeta {
    pub id: String,
    pub description: String,
    #[serde(default = "system", rename = "pluginId")]
    pub plugin_id: String,
    pub shortcut: Option<String>,
    #[serde(default, rename = "shortcutScope")]
    pub shortcut_scope: Option<String>,
}

// ======================== 核心插件数据结构 =============================
/**
 * 插件的静态数据。
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
}

// 插件状态枚举。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PluginStatus {
    Registered,
    Activating,
    Activated,
    Deactivating,
    Inactive,
    Disabled,
    Error(String),
}

/**
 * 插件运行信息,前端可以通过api随时获取到该信息。
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginEntry {
    #[serde(default, rename = "pluginId")]
    pub plugin_id: String,
    // 静态数据。
    pub manifest: PluginManifest,
    // 视图数据
    #[serde(default, rename = "viewMeta")]
    pub view_meta: Option<ViewMeta>,
    // 命令数据
    #[serde(default, rename = "commandsMeta")]
    pub commands_meta: Vec<CommandMeta>,
    // 运行状态。
    pub status: PluginStatus,
    // 视图资源url
    #[serde(default, rename = "viewUrl")]
    pub view_url: String,
    // 主模块url
    #[serde(default, rename = "moduleUrl")]
    pub module_url: String,
    // 生命周期钩子。
    // pub module: Box<dyn PluginActivation + Send>,
    // 注册的命令。
    // pub registered_commands: Vec<CommandMeta>,
}
