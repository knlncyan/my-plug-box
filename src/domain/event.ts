/**
 * 插件事件总线的事件类型声明。
 * - `setting.changed` 是框架内置事件，用于设置项变更通知。
 * - 其余字符串事件由插件自行定义，payload 类型为 `unknown`。
 */
export interface PluginEvents {
    "setting.changed": { pluginId: string; key: string; value: unknown };
    [event: string]: unknown;
}
