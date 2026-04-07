use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{command, AppHandle, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::utils::ApiResponse;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalShortcutBinding {
    pub command_id: String,
    pub shortcut: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalShortcutRegistrationError {
    pub command_id: String,
    pub shortcut: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalShortcutSyncResult {
    pub registered: Vec<GlobalShortcutBinding>,
    pub failed: Vec<GlobalShortcutRegistrationError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GlobalShortcutTriggeredPayload {
    command_id: String,
    shortcut: String,
}

#[command]
pub fn sync_global_shortcuts(
    app: AppHandle,
    bindings: HashMap<String, String>,
) -> ApiResponse<GlobalShortcutSyncResult> {
    let manager = app.global_shortcut();

    if let Err(error) = manager.unregister_all() {
        return ApiResponse::error(format!("failed to clear global shortcuts: {}", error));
    }

    let mut pairs: Vec<(String, String)> = bindings.into_iter().collect();
    pairs.sort_by(|a, b| a.0.cmp(&b.0));

    let mut registered = Vec::new();
    let mut failed = Vec::new();

    for (command_id, shortcut) in pairs {
        let parsed_shortcut = match shortcut.parse::<Shortcut>() {
            Ok(value) => value,
            Err(error) => {
                failed.push(GlobalShortcutRegistrationError {
                    command_id,
                    shortcut,
                    error: error.to_string(),
                });
                continue;
            }
        };

        let command_id_for_event = command_id.clone();
        let shortcut_for_event = shortcut.clone();

        let register_result = manager.on_shortcut(parsed_shortcut, move |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            let payload = GlobalShortcutTriggeredPayload {
                command_id: command_id_for_event.clone(),
                shortcut: shortcut_for_event.clone(),
            };
            let _ = app.emit("global-shortcut-triggered", payload);
        });

        match register_result {
            Ok(_) => {
                registered.push(GlobalShortcutBinding {
                    command_id,
                    shortcut,
                });
            }
            Err(error) => {
                failed.push(GlobalShortcutRegistrationError {
                    command_id,
                    shortcut,
                    error: error.to_string(),
                });
            }
        }
    }

    ApiResponse::success(
        GlobalShortcutSyncResult { registered, failed },
        "Ok".to_string(),
    )
}
