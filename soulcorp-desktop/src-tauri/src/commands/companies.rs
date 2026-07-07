use crate::db::persistence::{
    commit, delete_company_snapshot, flush_pending_commit, load_registry, reset_commit_debounce,
    save_registry, switch_active_company,
};
use crate::fate::clamp_event_chance;
use crate::commands::onboarding::persist_agent_roster_workspace;
use crate::state::{
    default_agent_roster, fresh_company_state, summary_from_state, AgentSlotSetup, AppState,
    CompanySummary, CustomProjectSetup, PlayMode, ProjectSetupMode,
};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanyListResponse {
    pub active_company_id: Option<String>,
    pub companies: Vec<CompanySummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCompanyRequest {
    pub company_name: String,
    pub industry: String,
    pub tagline: String,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwitchCompanyResponse {
    pub active_company_id: String,
    pub company: CompanySummary,
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
pub fn list_companies(
    app: AppHandle,
    app_state: State<'_, Mutex<AppState>>,
) -> Result<CompanyListResponse, String> {
    let locked = app_state.lock().map_err(|e| e.to_string())?;
    let mut registry = load_registry(&app)?;

    if registry.companies.is_empty() && !locked.company_id.is_empty() {
        registry.upsert_summary(summary_from_state(&locked));
        registry.active_company_id = Some(locked.company_id.clone());
        save_registry(&app, &registry)?;
    }

    if registry.active_company_id.is_none() {
        if let Some(first) = registry.companies.first() {
            registry.active_company_id = Some(first.id.clone());
            save_registry(&app, &registry)?;
        }
    }

    if let Some(active_id) = registry.active_company_id.clone() {
        if !registry.companies.iter().any(|company| company.id == active_id) {
            registry.active_company_id = registry.companies.first().map(|company| company.id.clone());
            save_registry(&app, &registry)?;
        }
    }

    Ok(CompanyListResponse {
        active_company_id: registry.active_company_id.clone(),
        companies: registry.companies.clone(),
    })
}

#[tauri::command]
pub fn create_company(
    request: CreateCompanyRequest,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<SwitchCompanyResponse, String> {
    let company_name = normalize_company_name(&request.company_name)?;
    let industry = normalize_optional_field(&request.industry, 64, "Industry")?;
    let tagline = normalize_optional_field(&request.tagline, 120, "Tagline")?;

    let current = app_state.lock().map_err(|e| e.to_string())?;
    if !current.company_id.is_empty() {
        commit(app.clone(), &current)?;
    }
    drop(current);

    let mut state = fresh_company_state(
        &company_name,
        &industry,
        &tagline,
        request.play_mode,
        request.pure_local_mode,
        request.random_events_enabled,
        clamp_event_chance(request.random_event_chance),
    );
    state.onboarding_completed = true;
    state.apply_agent_roster(&request.agent_roster)?;
    state.apply_project_setup(request.project_setup_mode, request.custom_project.clone())?;

    let company_id = state.company_id.clone();
    let summary = summary_from_state(&state);

    let mut registry = load_registry(&app)?;
    registry.upsert_summary(summary.clone());
    registry.active_company_id = Some(company_id.clone());
    save_registry(&app, &registry)?;
    commit(app.clone(), &state)?;
    persist_agent_roster_workspace(&app, &state)?;

    reset_commit_debounce(&company_id);
    let mut locked = app_state.lock().map_err(|e| e.to_string())?;
    *locked = state;

    Ok(SwitchCompanyResponse {
        active_company_id: company_id,
        company: summary,
    })
}

#[tauri::command]
pub fn switch_company(
    company_id: String,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<SwitchCompanyResponse, String> {
    let next = {
        let current = app_state.lock().map_err(|e| e.to_string())?;
        if current.company_id == company_id {
            return Ok(SwitchCompanyResponse {
                active_company_id: company_id,
                company: summary_from_state(&current),
            });
        }
        flush_pending_commit(app.clone(), &current)?;
        switch_active_company(&app, &current, &company_id)?
    };
    let summary = summary_from_state(&next);
    reset_commit_debounce(&next.company_id);
    *app_state.lock().map_err(|e| e.to_string())? = next;

    Ok(SwitchCompanyResponse {
        active_company_id: company_id,
        company: summary,
    })
}

#[tauri::command]
pub fn delete_company(
    company_id: String,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<CompanyListResponse, String> {
    let mut registry = load_registry(&app)?;
    if registry.companies.len() <= 1 {
        return Err("Keep at least one company on this device.".to_string());
    }
    if !registry.remove_company(&company_id) {
        return Err(format!("Company {company_id} not found."));
    }

    delete_company_snapshot(&app, &company_id)?;

    let current_id = app_state.lock().map_err(|e| e.to_string())?.company_id.clone();
    if current_id == company_id {
        let fallback_id = registry
            .companies
            .first()
            .map(|company| company.id.clone())
            .ok_or_else(|| "No companies remain.".to_string())?;
        registry.active_company_id = Some(fallback_id.clone());
        save_registry(&app, &registry)?;

        let current = app_state.lock().map_err(|e| e.to_string())?;
        let next = switch_active_company(&app, &current, &fallback_id)?;
        *app_state.lock().map_err(|e| e.to_string())? = next;
    } else {
        save_registry(&app, &registry)?;
    }

    let registry = load_registry(&app)?;
    Ok(CompanyListResponse {
        active_company_id: registry.active_company_id.clone(),
        companies: registry.companies.clone(),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCompanyVisionRequest {
    pub vision: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCompanyVisionResponse {
    pub company_vision: String,
}

#[tauri::command]
pub fn update_company_vision(
    request: UpdateCompanyVisionRequest,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<UpdateCompanyVisionResponse, String> {
    let vision = normalize_optional_field(&request.vision, 500, "Vision")?;
    let mut state = app_state.lock().map_err(|e| e.to_string())?;
    if state.company_id.is_empty() {
        return Err("No active company.".to_string());
    }
    state.company_vision = vision.clone();
    commit(app, &state)?;
    Ok(UpdateCompanyVisionResponse {
        company_vision: vision,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn company_name_validation_rejects_short_names() {
        assert!(normalize_company_name("A").is_err());
        assert!(normalize_company_name("  Acme  ").is_ok());
    }
}