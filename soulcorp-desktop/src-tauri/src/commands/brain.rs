use crate::brain::{
    effective_execution_label, effective_meeting_label, normalize_execution_override,
    normalize_meeting_override, resolve_execution_runtime, resolve_meeting_provider,
};
use crate::db::persistence::commit;
use crate::state::{AgentRecord, AppState};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepartmentBrainConfig {
    pub department: String,
    pub ai_provider: Option<String>,
    pub agent_runtime_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateDepartmentRuntimeModeRequest {
    pub department: String,
    pub agent_runtime_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAgentRuntimeModeRequest {
    pub agent_id: String,
    pub agent_runtime_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrainResolutionPreview {
    pub agent_id: String,
    pub department: String,
    pub meeting_brain_id: String,
    pub meeting_brain_label: String,
    pub meeting_provider: String,
    pub execution_runtime_id: String,
    pub execution_runtime_label: String,
}

#[tauri::command]
pub fn update_agent_runtime_mode(
    request: UpdateAgentRuntimeModeRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AgentRecord, String> {
    let runtime_mode = normalize_execution_override(request.agent_runtime_mode.as_deref())?;
    let mut state = state.lock().map_err(|e| e.to_string())?;
    let agent = state
        .agents
        .get_mut(&request.agent_id)
        .ok_or_else(|| format!("Agent {} not found.", request.agent_id))?;
    agent.agent_runtime_mode = runtime_mode;
    let snapshot = agent.clone();
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn update_department_runtime_mode(
    request: UpdateDepartmentRuntimeModeRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<DepartmentBrainConfig, String> {
    let department = request.department.trim();
    if department.is_empty() {
        return Err("Department name is required.".to_string());
    }

    let runtime_mode = normalize_execution_override(request.agent_runtime_mode.as_deref())?;
    let mut state = state.lock().map_err(|e| e.to_string())?;
    if let Some(mode) = runtime_mode.clone() {
        state
            .department_agent_runtimes
            .insert(department.to_string(), mode);
    } else {
        state.department_agent_runtimes.remove(department);
    }

    let snapshot = DepartmentBrainConfig {
        department: department.to_string(),
        ai_provider: state.department_ai_providers.get(department).cloned(),
        agent_runtime_mode: runtime_mode,
    };
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn get_brain_resolution_preview(
    agent_id: Option<String>,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<BrainResolutionPreview>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let agents: Vec<AgentRecord> = if let Some(id) = agent_id {
        state
            .agents
            .get(&id)
            .cloned()
            .into_iter()
            .collect()
    } else {
        state.agents.values().cloned().collect()
    };

    let previews = agents
        .into_iter()
        .map(|agent| {
            let meeting_brain_id = crate::brain::resolve_meeting_registry_id(
                &state.settings,
                &state.department_ai_providers,
                &agent.department,
                agent.ai_provider.as_deref(),
            );
            let execution_runtime_id = resolve_execution_runtime(
                &state.settings,
                &state.department_agent_runtimes,
                &agent.department,
                &agent,
            );
            BrainResolutionPreview {
                agent_id: agent.id.clone(),
                department: agent.department.clone(),
                meeting_brain_label: effective_meeting_label(
                    &state.settings,
                    &state.department_ai_providers,
                    &agent.department,
                    agent.ai_provider.as_deref(),
                ),
                meeting_brain_id,
                meeting_provider: resolve_meeting_provider(
                    &state.settings,
                    &state.department_ai_providers,
                    &agent.department,
                    agent.ai_provider.as_deref(),
                ),
                execution_runtime_id: execution_runtime_id.clone(),
                execution_runtime_label: effective_execution_label(&execution_runtime_id),
            }
        })
        .collect();

    Ok(previews)
}

pub fn normalize_meeting_provider_override(raw: Option<&str>) -> Result<Option<String>, String> {
    normalize_meeting_override(raw)
}