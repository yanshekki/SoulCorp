use crate::db::persistence::commit;
use crate::fate::{clamp_event_chance, sync_play_mode_side_effects};
use crate::state::{AppState, GameSettings, PlayMode};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsUpdate {
    pub random_events_enabled: Option<bool>,
    pub play_mode: Option<PlayMode>,
    pub random_event_chance: Option<f32>,
    pub god_mode_enabled: Option<bool>,
    pub ai_provider: Option<String>,
    pub ollama_base_url: Option<String>,
    pub ollama_model: Option<String>,
    pub openai_base_url: Option<String>,
    pub openai_api_key: Option<String>,
    pub openai_model: Option<String>,
    pub grok_base_url: Option<String>,
    pub grok_api_key: Option<String>,
    pub grok_model: Option<String>,
    pub claude_base_url: Option<String>,
    pub claude_api_key: Option<String>,
    pub claude_model: Option<String>,
    pub meeting_turns_per_agent: Option<u32>,
    pub meeting_llm_fallback: Option<bool>,
    pub pure_local_mode: Option<bool>,
    pub pixel_filter_enabled: Option<bool>,
    pub crt_filter_enabled: Option<bool>,
    pub low_power_mode: Option<bool>,
    pub backup_interval_minutes: Option<u32>,
    pub music_enabled: Option<bool>,
    pub music_volume: Option<f32>,
    pub sfx_enabled: Option<bool>,
    pub sfx_volume: Option<f32>,
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
    app: AppHandle,
) -> Result<GameSettings, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    if let Some(enabled) = update.random_events_enabled {
        state.settings.random_events_enabled = enabled;
    }
    if let Some(mode) = update.play_mode {
        state.settings.play_mode = mode;
    }
    if let Some(chance) = update.random_event_chance {
        state.settings.random_event_chance = clamp_event_chance(chance);
    }
    sync_play_mode_side_effects(&mut state);
    if let Some(enabled) = update.god_mode_enabled {
        state.settings.god_mode_enabled = enabled;
    }
    if let Some(provider) = update.ai_provider {
        state.settings.ai_provider = provider;
    }
    if let Some(url) = update.ollama_base_url {
        if !url.trim().is_empty() {
            state.settings.ollama_base_url = url.trim().to_string();
        }
    }
    if let Some(model) = update.ollama_model {
        if !model.trim().is_empty() {
            state.settings.ollama_model = model.trim().to_string();
        }
    }
    if let Some(url) = update.openai_base_url {
        if !url.trim().is_empty() {
            state.settings.openai_base_url = url.trim().to_string();
        }
    }
    if let Some(key) = update.openai_api_key {
        state.settings.openai_api_key = key;
    }
    if let Some(model) = update.openai_model {
        if !model.trim().is_empty() {
            state.settings.openai_model = model.trim().to_string();
        }
    }
    if let Some(url) = update.grok_base_url {
        if !url.trim().is_empty() {
            state.settings.grok_base_url = url.trim().to_string();
        }
    }
    if let Some(key) = update.grok_api_key {
        state.settings.grok_api_key = key;
    }
    if let Some(model) = update.grok_model {
        if !model.trim().is_empty() {
            state.settings.grok_model = model.trim().to_string();
        }
    }
    if let Some(url) = update.claude_base_url {
        if !url.trim().is_empty() {
            state.settings.claude_base_url = url.trim().to_string();
        }
    }
    if let Some(key) = update.claude_api_key {
        state.settings.claude_api_key = key;
    }
    if let Some(model) = update.claude_model {
        if !model.trim().is_empty() {
            state.settings.claude_model = model.trim().to_string();
        }
    }
    if let Some(turns) = update.meeting_turns_per_agent {
        state.settings.meeting_turns_per_agent = turns.clamp(1, 6);
    }
    if let Some(enabled) = update.meeting_llm_fallback {
        state.settings.meeting_llm_fallback = enabled;
    }
    if let Some(enabled) = update.pure_local_mode {
        state.settings.pure_local_mode = enabled;
    }
    if let Some(enabled) = update.pixel_filter_enabled {
        state.settings.pixel_filter_enabled = enabled;
    }
    if let Some(enabled) = update.crt_filter_enabled {
        state.settings.crt_filter_enabled = enabled;
    }
    if let Some(enabled) = update.low_power_mode {
        state.settings.low_power_mode = enabled;
    }
    if let Some(minutes) = update.backup_interval_minutes {
        state.settings.backup_interval_minutes = minutes;
    }
    if let Some(enabled) = update.music_enabled {
        state.settings.music_enabled = enabled;
    }
    if let Some(volume) = update.music_volume {
        state.settings.music_volume = volume.clamp(0.0, 1.0);
    }
    if let Some(enabled) = update.sfx_enabled {
        state.settings.sfx_enabled = enabled;
    }
    if let Some(volume) = update.sfx_volume {
        state.settings.sfx_volume = volume.clamp(0.0, 1.0);
    }

    let settings = state.settings.clone();
    commit(app, &state)?;
    Ok(settings)
}
