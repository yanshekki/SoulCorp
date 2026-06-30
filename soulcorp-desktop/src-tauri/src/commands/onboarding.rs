use crate::db::persistence::commit;
use crate::state::{AppState, EventMode};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnboardingState {
    pub company_name: String,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompleteOnboardingRequest {
    pub company_name: String,
    pub event_mode: EventMode,
    pub pure_local_mode: bool,
    pub random_events_enabled: bool,
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

#[tauri::command]
pub fn get_onboarding_state(state: State<'_, Mutex<AppState>>) -> Result<OnboardingState, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(OnboardingState {
        company_name: state.company_name.clone(),
        completed: state.onboarding_completed,
    })
}

#[tauri::command]
pub fn complete_onboarding(
    request: CompleteOnboardingRequest,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<OnboardingState, String> {
    let company_name = normalize_company_name(&request.company_name)?;

    let mut state = app_state.lock().map_err(|e| e.to_string())?;
    state.company_name = company_name.clone();
    state.onboarding_completed = true;
    state.settings.event_mode = request.event_mode;
    state.settings.pure_local_mode = request.pure_local_mode;
    state.settings.random_events_enabled = request.random_events_enabled;
    if request.event_mode == EventMode::Serious {
        state.settings.random_events_enabled = false;
    }
    if request.pure_local_mode {
        state.settings.ai_provider = "mock".to_string();
        state.hub.connected = false;
    }

    let snapshot = OnboardingState {
        company_name,
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
        assert_eq!(state.company_name, "SoulCorp");
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