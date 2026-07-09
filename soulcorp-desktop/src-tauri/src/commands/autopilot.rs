use crate::autopilot::{
    apply_full_autopilot_settings, ceo_approve_directive, ceo_comment_on_item,
    ceo_reject_deliverable, ceo_reject_directive, compute_autopilot_snapshot,
    dismiss_meeting_gate, approve_deliverable_with_gate, AutopilotSnapshot,
};
use crate::db::persistence::commit;
use crate::scrum::worker::apply_scrum_worker_tick;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CeoCommentRequest {
    pub item_kind: String,
    pub item_id: String,
    pub comment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CeoRejectRequest {
    pub item_id: String,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetInterventionModeRequest {
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetFullAutopilotRequest {
    pub enabled: bool,
}

#[tauri::command]
pub fn get_autopilot_snapshot(state: State<'_, Mutex<AppState>>) -> Result<AutopilotSnapshot, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(compute_autopilot_snapshot(&state))
}

#[tauri::command]
pub fn ceo_approve_directive_cmd(
    directive_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AutopilotSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ceo_approve_directive(&mut state, &directive_id)?;
    let _ = apply_scrum_worker_tick(&mut state, &app, false);
    commit(app, &state)?;
    Ok(compute_autopilot_snapshot(&state))
}

#[tauri::command]
pub fn ceo_reject_directive_cmd(
    request: CeoRejectRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AutopilotSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ceo_reject_directive(&mut state, &request.item_id, &request.reason)?;
    commit(app, &state)?;
    Ok(compute_autopilot_snapshot(&state))
}

#[tauri::command]
pub fn ceo_approve_deliverable_cmd(
    work_node_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AutopilotSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    approve_deliverable_with_gate(&mut state, &work_node_id)?;
    let _ = apply_scrum_worker_tick(&mut state, &app, false);
    commit(app, &state)?;
    Ok(compute_autopilot_snapshot(&state))
}

#[tauri::command]
pub fn ceo_reject_deliverable_cmd(
    request: CeoRejectRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AutopilotSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ceo_reject_deliverable(&mut state, &request.item_id, &request.reason)?;
    let _ = apply_scrum_worker_tick(&mut state, &app, false);
    commit(app, &state)?;
    Ok(compute_autopilot_snapshot(&state))
}

#[tauri::command]
pub fn ceo_comment_on_item_cmd(
    request: CeoCommentRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AutopilotSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ceo_comment_on_item(
        &mut state,
        &request.item_kind,
        &request.item_id,
        &request.comment,
    )?;
    commit(app, &state)?;
    Ok(compute_autopilot_snapshot(&state))
}

#[tauri::command]
pub fn dismiss_meeting_gate_cmd(
    meeting_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AutopilotSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    dismiss_meeting_gate(&mut state, &meeting_id);
    commit(app, &state)?;
    Ok(compute_autopilot_snapshot(&state))
}

#[tauri::command]
pub fn set_autopilot_intervention_mode(
    request: SetInterventionModeRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AutopilotSnapshot, String> {
    let mode = request.mode.trim().to_lowercase();
    if !matches!(
        mode.as_str(),
        "auto" | "gate_directives" | "gate_deliverables" | "paused"
    ) {
        return Err("Invalid intervention mode.".to_string());
    }
    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.settings.autopilot_intervention_mode = mode.clone();
    if mode == "paused" {
        state.settings.scrum_execution_paused = true;
    }
    commit(app, &state)?;
    Ok(compute_autopilot_snapshot(&state))
}

#[tauri::command]
pub fn set_full_autopilot(
    request: SetFullAutopilotRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AutopilotSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    apply_full_autopilot_settings(&mut state, request.enabled);
    commit(app, &state)?;
    Ok(compute_autopilot_snapshot(&state))
}

#[tauri::command]
pub fn resume_autopilot(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AutopilotSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.settings.scrum_execution_paused = false;
    if state.settings.autopilot_intervention_mode == "paused" {
        state.settings.autopilot_intervention_mode = "auto".to_string();
    }
    let snapshot = compute_autopilot_snapshot(&state);
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn pause_autopilot(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AutopilotSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.settings.scrum_execution_paused = true;
    state.settings.autopilot_intervention_mode = "paused".to_string();
    commit(app, &state)?;
    Ok(compute_autopilot_snapshot(&state))
}