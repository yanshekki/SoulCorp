use crate::autopilot::{
    apply_full_autopilot_settings, approve_deliverable_with_gate, ceo_approve_directive,
    ceo_comment_on_item, ceo_edit_directive, ceo_reject_deliverable, ceo_reject_directive,
    ceo_reroute_story, ceo_update_story_criteria, compute_autopilot_snapshot, dismiss_meeting_gate,
    meeting_follow_up_directive, AutopilotSnapshot,
};
use crate::db::persistence::commit;
use crate::scrum::worker::apply_scrum_worker_tick;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

use crate::lock_util::MutexExt;
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CeoEditDirectiveRequest {
    pub directive_id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CeoUpdateStoryCriteriaRequest {
    pub story_id: String,
    pub acceptance_criteria: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CeoRerouteStoryRequest {
    pub story_id: String,
}

#[tauri::command]
pub fn get_autopilot_snapshot(state: State<'_, Mutex<AppState>>) -> Result<AutopilotSnapshot, String> {
    let state = state.lock_or_recover()?;
    Ok(compute_autopilot_snapshot(&state))
}

#[tauri::command]
pub fn ceo_approve_directive_cmd(
    directive_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AutopilotSnapshot, String> {
    let mut state = state.lock_or_recover()?;
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
    let mut state = state.lock_or_recover()?;
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
    let mut state = state.lock_or_recover()?;
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
    let mut state = state.lock_or_recover()?;
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
    let mut state = state.lock_or_recover()?;
    ceo_comment_on_item(
        &mut state,
        Some(&app),
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
    let mut state = state.lock_or_recover()?;
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
    let mut state = state.lock_or_recover()?;
    state.settings.autopilot_intervention_mode = mode.clone();
    // Legacy "paused" mode still pauses execution; other modes only change gate policy
    // and do not force resume (Pause/Resume button owns run/stop).
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
    let mut state = state.lock_or_recover()?;
    apply_full_autopilot_settings(&mut state, request.enabled);
    commit(app, &state)?;
    Ok(compute_autopilot_snapshot(&state))
}

#[tauri::command]
pub fn resume_autopilot(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AutopilotSnapshot, String> {
    let mut state = state.lock_or_recover()?;
    // Run/stop is only scrum_execution_paused — preserve CEO gate mode.
    state.settings.scrum_execution_paused = false;
    if state.settings.autopilot_intervention_mode == "paused" {
        // Legacy: old clients used intervention_mode=paused as the pause switch.
        state.settings.autopilot_intervention_mode = "auto".to_string();
    }
    let snapshot = compute_autopilot_snapshot(&state);
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn ceo_edit_directive_cmd(
    request: CeoEditDirectiveRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AutopilotSnapshot, String> {
    let mut state = state.lock_or_recover()?;
    ceo_edit_directive(
        &mut state,
        &request.directive_id,
        request.title.as_deref(),
        request.description.as_deref(),
    )?;
    commit(app, &state)?;
    Ok(compute_autopilot_snapshot(&state))
}

#[tauri::command]
pub fn ceo_update_story_criteria_cmd(
    request: CeoUpdateStoryCriteriaRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AutopilotSnapshot, String> {
    let mut state = state.lock_or_recover()?;
    ceo_update_story_criteria(&mut state, &request.story_id, request.acceptance_criteria)?;
    commit(app, &state)?;
    Ok(compute_autopilot_snapshot(&state))
}

#[tauri::command]
pub fn ceo_reroute_story_cmd(
    request: CeoRerouteStoryRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AutopilotSnapshot, String> {
    let mut state = state.lock_or_recover()?;
    let _ = ceo_reroute_story(&mut state, &request.story_id)?;
    let _ = apply_scrum_worker_tick(&mut state, &app, false);
    commit(app, &state)?;
    Ok(compute_autopilot_snapshot(&state))
}

#[tauri::command]
pub fn meeting_follow_up_directive_cmd(
    meeting_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AutopilotSnapshot, String> {
    let mut state = state.lock_or_recover()?;
    let _ = meeting_follow_up_directive(&mut state, &meeting_id)?;
    let _ = apply_scrum_worker_tick(&mut state, &app, false);
    commit(app, &state)?;
    Ok(compute_autopilot_snapshot(&state))
}

#[tauri::command]
pub fn pause_autopilot(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AutopilotSnapshot, String> {
    let mut state = state.lock_or_recover()?;
    // Pause is a run/stop flag only — do not overwrite intervention gate mode
    // (avoids duplicating the "When CEO steps in" dropdown).
    state.settings.scrum_execution_paused = true;
    commit(app, &state)?;
    Ok(compute_autopilot_snapshot(&state))
}