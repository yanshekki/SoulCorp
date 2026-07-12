use crate::db::persistence::{commit, load_registry, save_registry};
use crate::fate::{clamp_event_chance, sync_play_mode_side_effects};
use crate::state::{
    default_agent_roster, fresh_company_state, summary_from_state, AgentRecord, AgentSlotSetup,
    AppState, CustomProjectSetup, PlayMode, ProjectSetupMode,
};
use crate::workspace::{company_workspace_root, WorkspaceStorage};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

use crate::lock_util::MutexExt;
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
    #[serde(default = "default_agent_roster")]
    pub agent_roster: Vec<AgentSlotSetup>,
    #[serde(default)]
    pub project_setup_mode: ProjectSetupMode,
    #[serde(default)]
    pub custom_project: Option<CustomProjectSetup>,
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
    let state = state.lock_or_recover()?;
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

    let mut state = app_state.lock_or_recover()?;
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
    if state.agents.is_empty() {
        state.apply_agent_roster(&request.agent_roster)?;
    }
    state.apply_project_setup(request.project_setup_mode, request.custom_project.clone())?;
    apply_v1_automation_defaults(&mut state);

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
    commit(app.clone(), &state)?;
    persist_agent_roster_workspace(&app, &state)?;
    crate::autopilot::bootstrap_first_cycle(&mut state, &app);
    commit(app.clone(), &state)?;
    Ok(snapshot)
}

pub fn persist_single_agent_soul(
    app: &AppHandle,
    state: &AppState,
    agent: &AgentRecord,
) -> Result<(), String> {
    if state.company_id.is_empty() || agent.agent_kind.as_deref() == Some("fate") {
        return Ok(());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = WorkspaceStorage::new(company_workspace_root(&dir, &state.company_id))?;
    storage.ensure_seed()?;
    storage.ensure_agent_folder(&agent.id, &agent.name, &agent.department)?;
    if let Some(soul) = &agent.soul {
        storage.write_agent_soul_file(&agent.id, &soul.raw_content)?;
    }
    // Create working memory.md alongside soul when the agent joins / is persisted.
    let agent_ctx = crate::workspace::AgentContext::from_record(agent);
    let _ = crate::workspace::agent_memory::ensure_memory_page(&storage, &agent_ctx);
    Ok(())
}

pub fn apply_v1_automation_defaults_public(state: &mut AppState) {
    apply_v1_automation_defaults(state);
}

fn apply_v1_automation_defaults(state: &mut AppState) {
    state.settings.scrum_worker_enabled = true;
    state.settings.orchestrator_enabled = true;
    state.settings.scrum_auto_route = true;
    state.settings.scrum_auto_schedule = true;
    state.settings.scrum_auto_execute = true;
    state.settings.scrum_auto_approve = true;
    state.settings.scrum_execution_paused = false;
    state.settings.autopilot_full_auto_enabled = true;
    state.settings.autopilot_intervention_mode = "auto".to_string();
    crate::autopilot::apply_autopilot_runtime_defaults(state);
}

pub fn persist_agent_roster_workspace(app: &AppHandle, state: &AppState) -> Result<(), String> {
    for agent in state.agents.values() {
        persist_single_agent_soul(app, state, agent)?;
    }
    Ok(())
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