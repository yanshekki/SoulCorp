use crate::db::persistence::{commit, load_registry, save_registry};
use crate::fate::{clamp_event_chance, sync_play_mode_side_effects};
use crate::state::{fresh_company_state, summary_from_state, AppState, PlayMode};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnboardingState {
    pub company_name: String,
    pub company_industry: String,
    pub company_tagline: String,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompleteOnboardingRequest {
    pub company_name: String,
    pub company_industry: String,
    pub company_tagline: String,
    pub play_mode: PlayMode,
    pub pure_local_mode: bool,
    pub random_events_enabled: bool,
    pub random_event_chance: f32,
}

fn normalize_company_name(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.len() < 2 {
        return Err("Company name must be at least 2 characters.".to_string());
    }
    if trimmed.len() > 48 {
        return Err("Company name must be 48 characters or fewer.".to_string());
    }
    Ok(trimmed.to_string())
}

fn normalize_optional_field(raw: &str, max_len: usize, label: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.len() > max_len {
        return Err(format!("{label} must be {max_len} characters or fewer."));
    }
    Ok(trimmed.to_string())
}

#[tauri::command]
pub fn get_onboarding_state(state: State<'_, Mutex<AppState>>) -> Result<OnboardingState, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let completed = state.onboarding_completed
        && !state.company_id.is_empty()
        && state.company_name.trim().len() >= 2;
    Ok(OnboardingState {
        company_name: state.company_name.clone(),
        company_industry: state.company_industry.clone(),
        company_tagline: state.company_tagline.clone(),
        completed,
    })
}

#[tauri::command]
pub fn complete_onboarding(
    request: CompleteOnboardingRequest,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<OnboardingState, String> {
    let company_name = normalize_company_name(&request.company_name)?;
    let company_industry = normalize_optional_field(&request.company_industry, 64, "Industry")?;
    let company_tagline = normalize_optional_field(&request.company_tagline, 120, "Tagline")?;
    let random_event_chance = clamp_event_chance(request.random_event_chance);

    let mut state = app_state.lock().map_err(|e| e.to_string())?;
    if state.company_id.is_empty() {
        let fresh = fresh_company_state(
            &company_name,
            &company_industry,
            &company_tagline,
            request.play_mode,
            request.pure_local_mode,
            request.random_events_enabled,
            random_event_chance,
        );
        *state = fresh;
    } else {
        state.company_name = company_name.clone();
        state.company_industry = company_industry.clone();
        state.company_tagline = company_tagline.clone();
        state.settings.play_mode = request.play_mode;
        state.settings.pure_local_mode = request.pure_local_mode;
        state.settings.random_events_enabled = request.random_events_enabled;
        state.settings.random_event_chance = random_event_chance;
        sync_play_mode_side_effects(&mut state);
        if request.pure_local_mode {
            state.settings.ai_provider = "mock".to_string();
            state.hub.connected = false;
        }
    }

    state.onboarding_completed = true;

    let mut registry = load_registry(&app)?;
    registry.upsert_summary(summary_from_state(&state));
    registry.active_company_id = Some(state.company_id.clone());
    save_registry(&app, &registry)?;

    let snapshot = OnboardingState {
        company_name,
        company_industry,
        company_tagline,
        completed: true,
    };
    commit(app, &state)?;
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_state_requires_onboarding() {
        let state = AppState::default();
        assert!(!state.onboarding_completed);
        assert!(state.company_name.is_empty());
    }

    #[test]
    fn legacy_save_without_onboarding_field_defaults_completed() {
        let state = AppState::default();
        let mut legacy = serde_json::to_value(&state).expect("serialize app state");
        legacy
            .as_object_mut()
            .expect("object")
            .remove("onboarding_completed");
        let restored: AppState =
            serde_json::from_value(legacy).expect("legacy app state without onboarding flag");
        assert!(restored.onboarding_completed);
    }
}