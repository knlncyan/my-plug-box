pub struct PluginContext {
    pub plugin_id: String,
}

impl Drop for PluginContext {
    fn drop(&mut self) {
        // RAII: 自动清理
        eprintln!("[PlugContext] 正在清理插件 {} 的资源", self.plugin_id);
        // 这里执行具体的清理逻辑，比如关闭通道、删除临时文件
    }
}
