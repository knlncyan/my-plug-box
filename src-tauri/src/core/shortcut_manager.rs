use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::core::CommandMeta;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum CommandCategory {
    System,
    Command,
    User,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ShortcutUpdateDTO {
    pub id: String,
    pub category: CommandCategory,
    pub shortcut: Option<String>,
    #[serde(default, rename = "shortcutScope")]
    pub shortcut_scope: Option<String>,
}

enum PathType {
    System,
    User,
}

pub struct ShortcutManager {
    _shortcut_map: HashMap<CommandCategory, Vec<CommandMeta>>,
    // 由命令id映射到Shortcut
    _registered_map: HashMap<String, Shortcut>,
}

fn get_file_path(app: &AppHandle, path_type: &PathType) -> Result<PathBuf, String> {
    let file_path = match path_type {
        PathType::System => {
            let root_path = app
                .path()
                .resource_dir()
                .map_err(|e| e.to_string())?
                .join("data");
            root_path.join("shortcut.json")
        }
        PathType::User => {
            let root_path = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?
                .join(".plug_data");
            root_path.join("user_shortcut.json")
        }
    };
    Ok(file_path)
}

fn read_shortcut_file(path: &Path) -> Result<Vec<CommandMeta>, String> {
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("failed to read {}: {}", path.display(), error))?;

    // 兼容 UTF-8 BOM，避免 plugin.json 在 Windows 编辑器下保存后解析失败。
    let normalized = raw.trim_start_matches('\u{feff}');

    serde_json::from_str::<Vec<CommandMeta>>(normalized)
        .map_err(|error| format!("failed to parse {}: {}", path.display(), error))
}

fn write_shortcut_file(app: &AppHandle, list: &Vec<CommandMeta>) -> Result<(), String> {
    let file_path = get_file_path(app, &PathType::User)?;
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create dir {}: {}", file_path.display(), error))?;
    }
    let raw = serde_json::to_string_pretty(list).map_err(|error| {
        format!(
            "failed to serialize json {}: {}",
            file_path.display(),
            error
        )
    })?;
    fs::write(&file_path, raw)
        .map_err(|error| format!("failed to write {}: {}", file_path.display(), error))?;

    Ok(())
}

impl ShortcutManager {
    const EVENT_KEY: &'static str = "shortcut-triggered";

    // 初始化方法，读取系统的快捷键默认配置和用户自定义配置
    pub fn new() -> Self {
        ShortcutManager {
            _shortcut_map: HashMap::new(),
            _registered_map: HashMap::new(),
        }
    }

    // 刷新所有已注册的快捷键（command类型的快捷键不刷新，而是主动注册来注入）
    pub fn refresh_shortcuts(&mut self, app: &AppHandle, commands: &[CommandMeta]) -> Result<(), String> {
        let manager = app.global_shortcut();
        manager
            .unregister_all()
            .map_err(|error| format!("failed to clear shortcuts: {}", error))?;

        self._shortcut_map.clear();
        self._registered_map.clear();

        let runnable_command_ids = commands
            .iter()
            .map(|command| command.id.clone())
            .collect::<HashSet<_>>();

        // 先注册用户的，用户优先级高于其他优先级
        let user_list = self.register_shortcut(app, PathType::User, Some(&runnable_command_ids))?;
        let sys_list = self.register_shortcut(app, PathType::System, None)?;

        self._shortcut_map.insert(CommandCategory::User, user_list);
        self._shortcut_map.insert(CommandCategory::System, sys_list);

        Ok(())
    }

    // 注册命令的快捷键配置
    pub fn register_commands(&mut self, app: &AppHandle, commands: Vec<CommandMeta>) -> Result<(), String> {
        let manager = app.global_shortcut();
        for cm in &commands {
            if !self._registered_map.contains_key(&cm.id) {
                if let Some(shortcut_str) = &cm.shortcut {
                    let parsed_shortcut = shortcut_str
                        .parse::<Shortcut>()
                        .map_err(|error| format!("{} convent to hot key failed: {}", shortcut_str, error))?;

                    if manager.is_registered(parsed_shortcut) {
                        return Err(format!("shortcut for command {} is already occupied", cm.id));
                    }

                    let cm_for_close = cm.clone();
                    manager
                        .on_shortcut(
                            parsed_shortcut,
                            move |app, _shortcut, event| {
                                if event.state != ShortcutState::Pressed {
                                    return;
                                }
                                let _ =
                                    app.emit(ShortcutManager::EVENT_KEY, cm_for_close.clone());
                            },
                        )
                        .map_err(|error| format!("failed to register shortcut {}: {}", cm.id, error))?;
                    self._registered_map.insert(cm.id.clone(), parsed_shortcut);
                }
            }
        }
        self._shortcut_map
            .insert(CommandCategory::Command, commands);

        Ok(())
    }

    // 更新单个快捷键
    pub fn update_shortcut(
        &mut self,
        app: &AppHandle,
        dto: ShortcutUpdateDTO,
    ) -> Result<Option<CommandMeta>, String> {
        let manager = app.global_shortcut();

        let mut shortcut_to_register = None;
        let old_shortcut = self._registered_map.get(&dto.id).cloned();

        // 1.拿到具体的命令元数据实体
        let mut cm = self
            .find_command_shortcut(&dto.id, &dto.category)
            .ok_or_else(|| format!("Command not found for id: {}", dto.id))?;

        // 2.修改快捷键
        if let Some(shortcut) = &dto.shortcut {
            // 2.1 解析新的快捷键
            let parsed_shortcut = shortcut
                .parse::<Shortcut>()
                .map_err(|error| format!("{} convent to hot key failed: {}", shortcut, error))?;
            if manager.is_registered(parsed_shortcut) && old_shortcut != Some(parsed_shortcut) {
                return Err(format!("Command {} shortcut is occupied", dto.id));
            }
            // 2.2 记录新的快捷键
            if old_shortcut != Some(parsed_shortcut) {
                shortcut_to_register = Some(parsed_shortcut);
                cm.shortcut = Some(shortcut.clone());
            }
        } else {
            if let Some(shortcut) = self._registered_map.remove(&dto.id) {
                let _ = manager
                    .unregister(shortcut)
                    .map_err(|e| format!("Failed to unregister old shortcut: {}", e))?;
                cm.shortcut = None;
            }
        }

        // 3.修改作用范围
        if let Some(shortcut_scope) = dto.shortcut_scope {
            cm.shortcut_scope = Some(shortcut_scope);
        }

        // 4.真正注册新快捷键
        if let Some(need_register_shortcut) = shortcut_to_register {
            // 4.1先尝试注销掉旧的
            if let Some(old_shortcut) = self._registered_map.remove(&dto.id) {
                let _ = manager
                    .unregister(old_shortcut)
                    .map_err(|e| format!("Failed to unregister old shortcut: {}", e))?;
            }
            // 4.2注册新的快捷键
            let cm_for_close = cm.clone();
            if let Err(error) = manager
                .on_shortcut(need_register_shortcut, move |app, _shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    let _ = app.emit(ShortcutManager::EVENT_KEY, cm_for_close.clone());
                })
                .map_err(|e| format!("Failed to register new shortcut: {}", e)) {
                if let Some(previous_shortcut) = old_shortcut {
                    let previous_cm = cm.clone();
                    manager
                        .on_shortcut(previous_shortcut, move |app, _shortcut, event| {
                            if event.state != ShortcutState::Pressed {
                                return;
                            }
                            let _ = app.emit(ShortcutManager::EVENT_KEY, previous_cm.clone());
                        })
                        .map_err(|rollback_error| format!("{}; rollback failed: {}", error, rollback_error))?;
                    self._registered_map.insert(dto.id.clone(), previous_shortcut);
                }

                return Err(error);
            }
            self._registered_map
                .insert(dto.id.clone(), need_register_shortcut);
        }

        self.update(app, &dto.id, &cm)?;
        Ok(Some(cm.clone()))
    }

    // 重置单个快捷键
    pub fn reset_shortcut(
        &mut self,
        app: &AppHandle,
        id: &str,
        category: &CommandCategory,
    ) -> Result<Option<CommandMeta>, String> {
        let manager = app.global_shortcut();

        // --- 第一阶段：预检查与数据准备 (只读) ---

        // 1. 获取 User 列表中的旧配置
        let user_list = self
            ._shortcut_map
            .get(&CommandCategory::User)
            .ok_or("User category not found")?;
        let user_cm = user_list.iter().find(|it| it.id == id).cloned();

        let Some(cm_to_remove) = user_cm else {
            return Ok(None);
        };

        // 2. 获取原始分类中的配置 (目标配置)
        let target_list = self
            ._shortcut_map
            .get(category)
            .ok_or(format!("Category {:?} not found", category))?;
        let original_cm = target_list
            .iter()
            .find(|it| it.id == id)
            .cloned()
            .ok_or(format!("Command {} not found in original category", id))?;

        // --- 第二阶段：尝试注册新快捷键 (高风险操作) ---

        // 3. 准备注册原始快捷键, 仅不相等时才注册，否则可以直接跳过
        if cm_to_remove.shortcut != original_cm.shortcut {
            if let Some(original_shortcut_str) = &original_cm.shortcut {
                // 3.1 确认注册条件
                let original_shortcut = original_shortcut_str
                    .parse::<Shortcut>()
                    .map_err(|e| format!("Original shortcut parse failed: {}", e))?;
                if manager.is_registered(original_shortcut) {
                    return Err(format!("Command {} original shortcut is occupied", id));
                }
                // 3.2 注销旧快捷键
                if let Some(old_shortcut) = self._registered_map.remove(id) {
                    let _ = manager
                        .unregister(old_shortcut)
                        .map_err(|e| format!("Failed to unregister old shortcut: {}", e))?;
                }
                // 3.3 注册新快捷键
                let cm_for_close = original_cm.clone();
                manager
                    .on_shortcut(original_shortcut, move |app, _shortcut, event| {
                        if event.state != ShortcutState::Pressed {
                            return;
                        }
                        let _ = app.emit(ShortcutManager::EVENT_KEY, cm_for_close.clone());
                    })
                    .map_err(|e| format!("Failed to register original shortcut: {}", e))?;
                self._registered_map
                    .insert(id.to_string(), original_shortcut);
            }
        }

        // --- 第三阶段：清理旧数据 (低风险操作) ---

        // 4. 从 User 列表中移除 (只有上面都成功了，才执行这里)
        let user_list = self._shortcut_map.get_mut(&CommandCategory::User).unwrap();
        user_list.retain(|it| it.id != id);

        // 5. 持久化
        write_shortcut_file(app, user_list)
            .map_err(|e| format!("Failed to write shortcut file: {}", e))?;

        Ok(Some(original_cm))
    }

    // 获取当前快捷键注册信息
    pub fn list_shortcut_map(&self) -> HashMap<CommandCategory, Vec<CommandMeta>> {
        self._shortcut_map.clone()
    }

    // 辅助方法：从文件中注册快捷键
    fn register_shortcut(
        &mut self,
        app: &AppHandle,
        file_type: PathType,
        runnable_command_ids: Option<&HashSet<String>>,
    ) -> Result<Vec<CommandMeta>, String> {
        let manager = app.global_shortcut();
        let file_path = get_file_path(app, &file_type);

        let shortcuts = file_path.and_then(|path| read_shortcut_file(&path))?;

        let shortcuts = match file_type {
            PathType::User => filter_user_shortcuts(shortcuts, runnable_command_ids),
            PathType::System => shortcuts,
        };

        for cm in &shortcuts {
            if !self._registered_map.contains_key(&cm.id) {
                if let Some(shortcut_str) = &cm.shortcut {
                    let parsed_shortcut = shortcut_str
                        .parse::<Shortcut>()
                        .map_err(|error| format!("{} convert to hot key failed: {}", shortcut_str, error))?;

                    if manager.is_registered(parsed_shortcut) {
                        return Err(format!("shortcut for command {} is already occupied", cm.id));
                    }

                    let cm_for_close = cm.clone();
                    manager
                        .on_shortcut(
                            parsed_shortcut,
                            move |app, _shortcut, event| {
                                if event.state != ShortcutState::Pressed {
                                    return;
                                }
                                let _ =
                                    app.emit(ShortcutManager::EVENT_KEY, cm_for_close.clone());
                            },
                        )
                        .map_err(|error| format!("failed to register shortcut {}: {}", cm.id, error))?;
                    self._registered_map.insert(cm.id.clone(), parsed_shortcut);
                }
            }
        }
        Ok(shortcuts)
    }

    // 辅助方法：根据 ID 查找对应的 CommandShortcut
    fn find_command_shortcut(&self, id: &str, category: &CommandCategory) -> Option<CommandMeta> {
        // 1. 优先在 User 分类下查找
        if let Some(list) = self._shortcut_map.get(&CommandCategory::User) {
            if let Some(sc) = list.iter().find(|sc| sc.id == id) {
                return Some(sc.clone());
            }
        }
        // 2. 如果 User 分类下没找到，再退回到指定的 category 查找
        if let Some(list) = self._shortcut_map.get(category) {
            if let Some(sc) = list.iter().find(|sc| sc.id == id) {
                return Some(sc.clone());
            }
        }
        None
    }

    // 辅助方法：更新快捷键映射表中的快捷键,并且持久化
    fn update(
        &mut self,
        app: &AppHandle,
        id: &str,
        new_command_meta: &CommandMeta,
    ) -> Result<(), String> {
        // 1.获取 User 分类的入口，如果不存在则创建一个空的 Vec
        let list = self
            ._shortcut_map
            .entry(CommandCategory::User)
            .or_insert_with(Vec::new);

        // 2.更新数据
        if let Some(existing_sc) = list.iter_mut().find(|sc| sc.id == id) {
            *existing_sc = new_command_meta.clone();
        } else {
            list.push(new_command_meta.clone());
        }

        // 3.持久化
        write_shortcut_file(app, list)
    }
}

fn filter_user_shortcuts(
    shortcuts: Vec<CommandMeta>,
    runnable_command_ids: Option<&HashSet<String>>,
) -> Vec<CommandMeta> {
    let Some(runnable_command_ids) = runnable_command_ids else {
        return shortcuts;
    };

    shortcuts
        .into_iter()
        .filter(|shortcut| {
            if shortcut.plugin_id == "system" {
                return true;
            }

            runnable_command_ids.contains(&shortcut.id)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{filter_user_shortcuts, CommandMeta};
    use std::collections::HashSet;

    fn make_shortcut(id: &str, plugin_id: &str) -> CommandMeta {
        CommandMeta {
            id: id.to_string(),
            description: format!("{} description", id),
            plugin_id: plugin_id.to_string(),
            shortcut: Some("Ctrl+K".to_string()),
            shortcut_scope: Some("local".to_string()),
        }
    }

    #[test]
    fn user_shortcuts_for_disabled_plugin_commands_are_filtered_out() {
        let shortcuts = vec![
            make_shortcut("system-command-pattern.open", "system"),
            make_shortcut("external.enabled.open", "external.enabled"),
            make_shortcut("external.disabled.open", "external.disabled"),
        ];
        let runnable_command_ids = HashSet::from(["external.enabled.open".to_string()]);

        let filtered = filter_user_shortcuts(shortcuts, Some(&runnable_command_ids));

        assert_eq!(filtered.len(), 2);
        assert!(filtered.iter().any(|shortcut| shortcut.id == "system-command-pattern.open"));
        assert!(filtered.iter().any(|shortcut| shortcut.id == "external.enabled.open"));
        assert!(!filtered.iter().any(|shortcut| shortcut.id == "external.disabled.open"));
    }
}
