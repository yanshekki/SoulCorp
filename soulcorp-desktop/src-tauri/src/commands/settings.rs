use crate::state::{AppState, EventMode, GameSettings};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsUpdate {
    pub random_events_enabled: Option<bool>,
    pub event_mode: Option<EventMode>,
    pub god_mode_enabled: Option<bool>,
    pub ai_provider: Option<String>,
}

#[tauri::command]
pub fn get_game_settings(state: State<'_, Mutex<AppState>>) -> Result<GameSettings, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.settings.clone())
}

#[tauri::command]
pub fn update_game_settings(
    update: SettingsUpdate,
    state: State<'_, Mutex<AppState>>,
) -> Result<GameSettings, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    if let Some(enabled) = update.random_events_enabled {
        state.settings.random_events_enabled = enabled;
    }
    if let Some(mode) = update.event_mode {
        state.settings.event_mode = mode;
        if mode == EventMode::Serious {
            state.settings.random_events_enabled = false;
        }
    }
    if let Some(enabled) = update.god_mode_enabled {
        state.settings.god_mode_enabled = enabled;
    }
    if let Some(provider) = update.ai_provider {
        state.settings.ai_provider = provider;
    }

    Ok(state.settings.clone())
}
