// 存储元数据
use serde::{Serialize, Deserialize};

/// 视图元数据：描述一个插件贡献的页面
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewMeta {
    pub id: String,          // 唯一 ID，如 "welcome.main"
    pub title: String,       // 显示标题
    pub plugin_id: String,   // 归属插件 ID
    pub component_path: String, // 前端组件路径标识 (如 "plugin-id/views/Name")
    pub props: serde_json::Value, // 传递给组件的初始参数
}

/// 命令元数据：描述一个插件注册的命令
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandMeta {
    pub id: String,
    pub description: String,
    pub plugin_id: String,
}

/// 插件简要信息 (用于列表展示)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginSummary {
    pub id: String,
    pub name: String,
    pub version: String,
    pub status: String, // "Registered", "Activated", "Error"
    pub error: Option<String>,
    pub description: Option<String>,
} 