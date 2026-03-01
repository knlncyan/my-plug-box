use crate::core::{PluginActivation, PluginContext};

/// 专门用于 JS 插件的适配器
/// 它本身不包含业务逻辑，只是作为一个“占位符”和“生命周期锚点”
pub struct JsPluginAdapter {
    pub plugin_id: String,
}

impl JsPluginAdapter {
    pub fn new(plugin_id: String) -> Self {
        JsPluginAdapter { plugin_id }
    }
}

impl PluginActivation for JsPluginAdapter {
    fn activate(&self, _context: &PluginContext) -> Result<(), String> {
        // 这里不需要写具体的业务代码。
        // 它的唯一任务是：告诉后端“这个 JS 插件正在被激活”。
        // 如果需要，可以在这里通过 AppHandle 发送事件给前端，
        // 让前端去执行真正的 JS `activate()` 函数。

        println!(
            "[Adapter] JS 插件 {} 激活信号已发出 (实际逻辑在前端)",
            self.plugin_id
        );

        // 如果采用“前端主动加载”模式，这里直接返回 Ok 即可
        Ok(())
    }

    fn deactivate(&self) -> Result<(), String> {
        println!("[Adapter] JS 插件 {} 停用信号已发出", self.plugin_id);
        // 同样，通知前端清理 JS 资源
        Ok(())
    }
}
