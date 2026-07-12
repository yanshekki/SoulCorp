use crate::ai::{self, provider::ChatRequest, provider::ChatTurn, BilledChatRequest, MeetingAiStatus};
use crate::db::persistence::commit;
use crate::progress::ProgressReporter;
use crate::relationships::{relationship_label, upsert_relationship};
use crate::soul::build_chat_parts_for_agent;
use crate::state::{AppState, InternalProject, MeetingMessage, MeetingState};
use crate::workspace::write_meeting_notes_from_state;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::lock_util::MutexExt;
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartMeetingRequest {
    pub agent_ids: Vec<String>,
    pub meeting_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingSnapshot {
    pub id: String,
    pub meeting_type: String,
    pub participant_ids: Vec<String>,
    pub messages: Vec<MeetingMessage>,
    pub completed: bool,
    pub morale_delta: f32,
    pub outcome_summary: Option<String>,
    pub project_progress_delta: f32,
    pub revenue_delta: f64,
    pub active_provider: String,
    pub turns_per_agent: u32,
    #[serde(default)]
    pub notes_page_id: Option<String>,
    /// Tasks created when the meeting closed (backlog / sprint).
    #[serde(default)]
    pub tasks_spawned: u32,
    #[serde(default)]
    pub directive_id: Option<String>,
    #[serde(default)]
    pub work_started: bool,
    #[serde(default)]
    pub key_points: Vec<String>,
    #[serde(default)]
    pub decisions: Vec<String>,
    #[serde(default)]
    pub action_items: Vec<String>,
    #[serde(default)]
    pub risks_blockers: Vec<String>,
    #[serde(default)]
    pub notes_write_error: Option<String>,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub completed_at: Option<String>,
    #[serde(default)]
    pub story_id: Option<String>,
    #[serde(default)]
    pub task_ids: Vec<String>,
    /// Per-action backlog task titles (parallel to action_items when available).
    #[serde(default)]
    pub action_task_links: Vec<MeetingActionLink>,
}

// Note: story_id/task_ids also live on MeetingState for history.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingActionLink {
    pub action: String,
    #[serde(default)]
    pub task_id: Option<String>,
    #[serde(default)]
    pub task_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingHistoryItem {
    pub id: String,
    pub meeting_type: String,
    pub completed: bool,
    pub participant_count: usize,
    pub message_count: usize,
    pub outcome_summary: Option<String>,
    pub notes_page_id: Option<String>,
    pub tasks_spawned: u32,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub key_points: Vec<String>,
    pub action_items: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateMeetingRecapRequest {
    pub meeting_id: String,
    #[serde(default)]
    pub outcome_summary: Option<String>,
    #[serde(default)]
    pub key_points: Option<Vec<String>>,
    #[serde(default)]
    pub decisions: Option<Vec<String>>,
    #[serde(default)]
    pub action_items: Option<Vec<String>>,
    #[serde(default)]
    pub risks_blockers: Option<Vec<String>>,
    /// If true, rewrite workspace notes page from recap.
    #[serde(default)]
    pub rewrite_notes: bool,
}

#[tauri::command]
pub fn get_active_meeting(
    state: State<'_, Mutex<AppState>>,
) -> Result<Option<MeetingSnapshot>, String> {
    let state = state.lock_or_recover()?;
    let ai_status = ai::probe_meeting_ai(&state.settings, &state.hub);
    let meeting = state
        .meetings
        .values()
        .find(|meeting| !meeting.completed);
    Ok(meeting.map(|meeting| {
        let mut snap =
            snapshot_from_meeting(meeting, &ai_status, state.settings.meeting_turns_per_agent);
        // Incomplete meetings usually have no links; still fill if any task_ids exist.
        snap.action_task_links = build_action_links(meeting, &state);
        snap
    }))
}

/// Past + incomplete meetings, newest first (for history UI).
#[tauri::command]
pub fn list_meetings(
    state: State<'_, Mutex<AppState>>,
    limit: Option<u32>,
) -> Result<Vec<MeetingHistoryItem>, String> {
    let state = state.lock_or_recover()?;
    let limit = limit.unwrap_or(50).clamp(1, 200) as usize;
    let mut items: Vec<MeetingHistoryItem> = state
        .meetings
        .values()
        .map(|m| MeetingHistoryItem {
            id: m.id.clone(),
            meeting_type: m.meeting_type.clone(),
            completed: m.completed,
            participant_count: m.participant_ids.len(),
            message_count: m.messages.len(),
            outcome_summary: m.outcome_summary.clone(),
            notes_page_id: m.notes_page_id.clone(),
            tasks_spawned: m.task_ids.len() as u32,
            started_at: m.started_at.clone(),
            completed_at: m.completed_at.clone(),
            key_points: m.key_points.clone(),
            action_items: m.action_items.clone(),
        })
        .collect();
    items.sort_by(|a, b| {
        let a_key = a
            .completed_at
            .as_deref()
            .or(a.started_at.as_deref())
            .unwrap_or("");
        let b_key = b
            .completed_at
            .as_deref()
            .or(b.started_at.as_deref())
            .unwrap_or("");
        b_key.cmp(a_key)
    });
    items.truncate(limit);
    Ok(items)
}

#[tauri::command]
pub fn get_meeting(
    meeting_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<MeetingSnapshot, String> {
    let state = state.lock_or_recover()?;
    let ai_status = ai::probe_meeting_ai(&state.settings, &state.hub);
    let meeting = state
        .meetings
        .get(&meeting_id)
        .ok_or_else(|| "Meeting not found.".to_string())?;
    let mut snap =
        snapshot_from_meeting(meeting, &ai_status, state.settings.meeting_turns_per_agent);
    snap.tasks_spawned = meeting.task_ids.len() as u32;
    snap.directive_id = meeting.directive_id.clone();
    snap.story_id = meeting.story_id.clone();
    snap.task_ids = meeting.task_ids.clone();
    snap.action_task_links = build_action_links(meeting, &state);
    Ok(snap)
}

#[tauri::command]
pub fn update_meeting_recap(
    app: AppHandle,
    request: UpdateMeetingRecapRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<MeetingSnapshot, String> {
    let mut state = state.lock_or_recover()?;
    {
        let meeting = state
            .meetings
            .get(&request.meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?;
        if !meeting.completed {
            return Err("Only completed meetings can edit recap.".into());
        }
    }
    let participant_ids = state
        .meetings
        .get(&request.meeting_id)
        .map(|m| m.participant_ids.clone())
        .unwrap_or_default();
    let participant_names: Vec<String> = participant_ids
        .iter()
        .filter_map(|id| state.agents.get(id).map(|a| a.name.clone()))
        .collect();
    let meeting_type = state
        .meetings
        .get(&request.meeting_id)
        .map(|m| m.meeting_type.clone())
        .unwrap_or_default();

    if let Some(meeting) = state.meetings.get_mut(&request.meeting_id) {
        if let Some(s) = request.outcome_summary {
            meeting.outcome_summary = Some(s);
        }
        if let Some(v) = request.key_points {
            meeting.key_points = v;
        }
        if let Some(v) = request.decisions {
            meeting.decisions = v;
        }
        if let Some(v) = request.action_items {
            meeting.action_items = v;
        }
        if let Some(v) = request.risks_blockers {
            meeting.risks_blockers = v;
        }
        meeting.notes_generated = false;
        meeting.notes_write_error = None;
    }

    let minutes = {
        let meeting = state
            .meetings
            .get(&request.meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?;
        crate::meeting::MeetingMinutes {
            title: format!("{meeting_type} — Meeting Minutes"),
            meeting_type: meeting_type.clone(),
            participants: participant_names,
            outcome_summary: meeting
                .outcome_summary
                .clone()
                .unwrap_or_else(|| "Meeting closed.".into()),
            key_points: meeting.key_points.clone(),
            decisions: meeting.decisions.clone(),
            action_items: meeting.action_items.clone(),
            risks_blockers: meeting.risks_blockers.clone(),
            notes_write_error: None,
            task_ids: meeting.task_ids.clone(),
        }
    };
    if request.rewrite_notes {
        if let Err(error) =
            write_meeting_notes_from_state(&app, &mut state, &request.meeting_id, Some(&minutes))
        {
            if let Some(m) = state.meetings.get_mut(&request.meeting_id) {
                m.notes_write_error = Some(error.clone());
            }
            commit(app.clone(), &state)?;
            return Err(error);
        }
    }
    let ai_status = ai::probe_meeting_ai(&state.settings, &state.hub);
    let meeting = state
        .meetings
        .get(&request.meeting_id)
        .ok_or_else(|| "Meeting not found.".to_string())?;
    let mut snap =
        snapshot_from_meeting(meeting, &ai_status, state.settings.meeting_turns_per_agent);
    snap.tasks_spawned = meeting.task_ids.len() as u32;
    snap.directive_id = meeting.directive_id.clone();
    snap.story_id = meeting.story_id.clone();
    snap.task_ids = meeting.task_ids.clone();
    snap.action_task_links = build_action_links(meeting, &state);
    commit(app, &state)?;
    Ok(snap)
}

/// Export completed meeting minutes as Markdown (+ JSON twin) under app data /exports.
/// Returns the Markdown path (JSON is written next to it with the same stem).
#[tauri::command]
pub fn export_meeting_minutes(
    app: AppHandle,
    meeting_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<String, String> {
    let state = state.lock_or_recover()?;
    let meeting = state
        .meetings
        .get(&meeting_id)
        .ok_or_else(|| "Meeting not found.".to_string())?;
    let md = render_meeting_markdown(meeting, &state);
    let json = render_meeting_json(meeting, &state)?;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("exports");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
    let safe_type = meeting
        .meeting_type
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>();
    let stem = format!("meeting-{safe_type}-{stamp}");
    let md_path = dir.join(format!("{stem}.md"));
    let json_path = dir.join(format!("{stem}.json"));
    std::fs::write(&md_path, md).map_err(|e| e.to_string())?;
    std::fs::write(&json_path, json).map_err(|e| e.to_string())?;
    Ok(format!(
        "{} (+ {})",
        md_path.to_string_lossy(),
        json_path.file_name().and_then(|n| n.to_str()).unwrap_or("json")
    ))
}

fn render_meeting_json(meeting: &MeetingState, state: &AppState) -> Result<String, String> {
    let names: Vec<String> = meeting
        .participant_ids
        .iter()
        .filter_map(|id| state.agents.get(id).map(|a| a.name.clone()))
        .collect();
    let tasks: Vec<serde_json::Value> = meeting
        .task_ids
        .iter()
        .map(|tid| {
            let title = state
                .work_nodes
                .iter()
                .find(|n| n.id == *tid)
                .map(|n| n.title.clone());
            serde_json::json!({ "id": tid, "title": title })
        })
        .collect();
    let payload = serde_json::json!({
        "id": meeting.id,
        "meeting_type": meeting.meeting_type,
        "started_at": meeting.started_at,
        "completed_at": meeting.completed_at,
        "completed": meeting.completed,
        "participants": names,
        "participant_ids": meeting.participant_ids,
        "outcome_summary": meeting.outcome_summary,
        "key_points": meeting.key_points,
        "decisions": meeting.decisions,
        "action_items": meeting.action_items,
        "risks_blockers": meeting.risks_blockers,
        "task_ids": meeting.task_ids,
        "tasks": tasks,
        "story_id": meeting.story_id,
        "directive_id": meeting.directive_id,
        "notes_page_id": meeting.notes_page_id,
        "messages": meeting.messages,
    });
    serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())
}

fn render_meeting_markdown(meeting: &MeetingState, state: &AppState) -> String {
    let names: Vec<String> = meeting
        .participant_ids
        .iter()
        .filter_map(|id| state.agents.get(id).map(|a| a.name.clone()))
        .collect();
    let mut out = String::new();
    out.push_str(&format!("# {}\n\n", meeting.meeting_type));
    if let Some(t) = &meeting.completed_at {
        out.push_str(&format!("- Completed: {t}\n"));
    }
    if let Some(t) = &meeting.started_at {
        out.push_str(&format!("- Started: {t}\n"));
    }
    out.push_str(&format!("- Participants: {}\n\n", names.join(", ")));
    if let Some(s) = &meeting.outcome_summary {
        out.push_str("## Summary\n\n");
        out.push_str(s);
        out.push_str("\n\n");
    }
    for (title, items) in [
        ("Key points", &meeting.key_points),
        ("Decisions", &meeting.decisions),
        ("Action items", &meeting.action_items),
        ("Risks & blockers", &meeting.risks_blockers),
    ] {
        if items.is_empty() {
            continue;
        }
        out.push_str(&format!("## {title}\n\n"));
        for item in items {
            out.push_str(&format!("- {item}\n"));
        }
        out.push('\n');
    }
    if !meeting.task_ids.is_empty() {
        out.push_str("## Backlog tasks\n\n");
        for tid in &meeting.task_ids {
            let title = state
                .work_nodes
                .iter()
                .find(|n| n.id == *tid)
                .map(|n| n.title.clone())
                .unwrap_or_else(|| tid.clone());
            out.push_str(&format!("- `{tid}` — {title}\n"));
        }
        out.push('\n');
    }
    out.push_str("## Transcript\n\n");
    for msg in &meeting.messages {
        out.push_str(&format!("**{}:** {}\n\n", msg.speaker_name, msg.content));
    }
    out
}

fn build_action_links(meeting: &MeetingState, state: &AppState) -> Vec<MeetingActionLink> {
    let mut links = Vec::new();
    for (i, action) in meeting.action_items.iter().enumerate() {
        let task_id = meeting.task_ids.get(i).cloned();
        let task_title = task_id.as_ref().and_then(|tid| {
            state
                .work_nodes
                .iter()
                .find(|n| n.id == *tid)
                .map(|n| n.title.clone())
        });
        links.push(MeetingActionLink {
            action: action.clone(),
            task_id,
            task_title,
        });
    }
    // Orphan tasks without action text
    if meeting.action_items.is_empty() {
        for tid in &meeting.task_ids {
            let task_title = state
                .work_nodes
                .iter()
                .find(|n| n.id == *tid)
                .map(|n| n.title.clone());
            links.push(MeetingActionLink {
                action: task_title.clone().unwrap_or_else(|| tid.clone()),
                task_id: Some(tid.clone()),
                task_title,
            });
        }
    }
    links
}

#[tauri::command]
pub fn get_meeting_ai_status(state: State<'_, Mutex<AppState>>) -> Result<MeetingAiStatus, String> {
    let state = state.lock_or_recover()?;
    Ok(ai::probe_meeting_ai(&state.settings, &state.hub))
}

/// Live-test the current meeting-brain credentials (green/red light for Settings).
/// Runs off the UI thread so a slow API cannot freeze the window.
#[tauri::command]
pub async fn test_meeting_provider(
    app: AppHandle,
) -> Result<ai::ProviderCredentialProbe, String> {
    tokio::task::spawn_blocking(move || {
        let state_mutex = app.state::<Mutex<AppState>>();
        let (settings, hub) = {
            let state = state_mutex.lock_or_recover()?;
            (state.settings.clone(), state.hub.clone())
        };
        Ok(ai::probe_provider_credentials(&settings, &hub))
    })
    .await
    .map_err(|e| format!("provider probe task failed: {e}"))?
}

#[tauri::command]
pub async fn start_meeting(
    request: StartMeetingRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<MeetingSnapshot, String> {
    // Keep start_meeting async + short critical section so the button never "does nothing"
    // while a worker holds AppState or a network probe hangs.
    let snapshot = {
        let mut state = state.lock_or_recover()?;

        let participant_ids: Vec<String> = request
            .agent_ids
            .iter()
            .filter(|agent_id| {
                state
                    .agents
                    .get(*agent_id)
                    .is_some_and(|agent| !crate::fate::is_system_agent(agent))
            })
            .cloned()
            .collect();
        if participant_ids.len() < 2 {
            crate::app_log::log_warn(
                &app,
                crate::app_log::LogCategory::Meeting,
                "start_meeting",
                "Meetings require at least two valid agents",
            );
            return Err("Meetings require at least two valid agents.".to_string());
        }

        // Force-close any incomplete meetings left over from a crashed/stuck session.
        let stuck_ids: Vec<String> = state
            .meetings
            .iter()
            .filter(|(_, m)| !m.completed)
            .map(|(id, _)| id.clone())
            .collect();
        for stuck_id in stuck_ids {
            if let Some(stuck) = state.meetings.get_mut(&stuck_id) {
                stuck.completed = true;
                stuck.outcome_summary =
                    Some("Auto-closed: starting a new meeting.".to_string());
                let ids = stuck.participant_ids.clone();
                for agent_id in ids {
                    if let Some(agent) = state.agents.get_mut(&agent_id) {
                        if agent.status == "meeting" {
                            agent.status = "idle".to_string();
                        }
                    }
                }
            }
        }
        // Also free any agent still tagged meeting without an open meeting.
        for agent in state.agents.values_mut() {
            if agent.status == "meeting" {
                agent.status = "idle".to_string();
            }
        }

        // Seed internal wallets so cloud-API meetings are not blocked by empty leaf balances.
        crate::token_budget::fund_meeting_participants(&mut state, &participant_ids, 25_000);

        let meeting_id = Uuid::new_v4().to_string();
        // Light status only — no network probe under the Start Meeting lock.
        let active_provider = crate::ai::configured_meeting_provider(&state.settings);
        let ai_status = MeetingAiStatus {
            configured_provider: state.settings.ai_provider.clone(),
            active_provider: active_provider.clone(),
            ollama_reachable: false,
            hub_configured: false,
            hub_reachable: false,
            ollama_model: state.settings.ollama_model.clone(),
            ollama_base_url: state.settings.ollama_base_url.clone(),
            meeting_turns_per_agent: state.settings.meeting_turns_per_agent,
            fallback_enabled: state.settings.meeting_llm_fallback,
            message: format!("Meeting ready · {active_provider}"),
        };
        let meeting = MeetingState {
            id: meeting_id.clone(),
            meeting_type: request.meeting_type.clone(),
            participant_ids: participant_ids.clone(),
            messages: Vec::new(),
            turn: 0,
            completed: false,
            morale_delta: morale_delta_for_type(&request.meeting_type),
            outcome_summary: None,
            project_progress_delta: 0.0,
            revenue_delta: 0.0,
            notes_generated: false,
            notes_page_id: None,
            key_points: Vec::new(),
            decisions: Vec::new(),
            action_items: Vec::new(),
            risks_blockers: Vec::new(),
            notes_write_error: None,
            started_at: Some(chrono::Utc::now().to_rfc3339()),
            completed_at: None,
            story_id: None,
            task_ids: Vec::new(),
            directive_id: None,
        };

        for agent_id in &participant_ids {
            if let Some(agent) = state.agents.get_mut(agent_id) {
                agent.status = "meeting".to_string();
            }
        }

        state.meetings.insert(meeting_id.clone(), meeting);
        let snapshot = snapshot_from_meeting(
            state
                .meetings
                .get(&meeting_id)
                .ok_or_else(|| "Meeting not found.".to_string())?,
            &ai_status,
            state.settings.meeting_turns_per_agent,
        );
        if let Err(error) = commit(app.clone(), &state) {
            crate::app_log::log_error(
                &app,
                crate::app_log::LogCategory::Meeting,
                "start_meeting_commit",
                format!("start commit failed: {error}"),
            );
            // Still return snapshot — meeting is in memory.
        }
        snapshot
    };

    Ok(snapshot)
}

#[tauri::command]
pub async fn advance_meeting(
    meeting_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<MeetingSnapshot, String> {
    let (turn_plan, expected_turn, expected_completed) = {
        let state = state.lock_or_recover()?;
        let meeting = state
            .meetings
            .get(&meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?;

        if meeting.completed {
            let ai_status = ai::probe_meeting_ai(&state.settings, &state.hub);
            return Ok(snapshot_from_meeting(
                meeting,
                &ai_status,
                state.settings.meeting_turns_per_agent,
            ));
        }

        let expected_turn = meeting.turn;
        let expected_completed = meeting.completed;
        let turns_per_agent = state.settings.meeting_turns_per_agent.max(1);
        let should_complete =
            meeting.turn >= meeting.participant_ids.len() * turns_per_agent as usize;
        if should_complete {
            (None, expected_turn, expected_completed)
        } else {
            (
                Some(prepare_meeting_turn(&state, meeting)?),
                expected_turn,
                expected_completed,
            )
        }
    };

    if turn_plan.is_none() {
        return finalize_meeting(&meeting_id, state, app).await;
    }

    let turn_plan = turn_plan.expect("turn plan exists");
    let chat_request = turn_plan.chat_request.clone();
    let department_providers = turn_plan.department_ai_providers.clone();
    let speaker_department = turn_plan.speaker_department.clone();
    let speaker_ai_provider = turn_plan.speaker_ai_provider.clone();
    let speaker_name = turn_plan.speaker_name.clone();
    let provider_label = speaker_ai_provider
        .clone()
        .unwrap_or_else(|| turn_plan.settings.ai_provider.clone());
    let turn_step = format!("turn_{expected_turn}");
    let session_id = {
        let mut guard = state.lock_or_recover()?;
        let speaker = guard
            .agents
            .get(&turn_plan.speaker_id)
            .cloned()
            .ok_or_else(|| "Speaker not found.".to_string())?;
        let (brain_label, transport) = crate::agent_activity::resolve_brain_labels(
            &guard,
            &speaker,
            crate::agent_activity::BrainLayer::Meeting,
        );
        let session_id = crate::agent_activity::start_session(
            &mut guard,
            Some(&app),
            crate::agent_activity::NewSessionParams {
                agent_id: speaker.id.clone(),
                agent_name: speaker.name.clone(),
                source: crate::agent_activity::ActivitySource::Meeting,
                brain_layer: crate::agent_activity::BrainLayer::Meeting,
                brain_label,
                transport,
                work_node_id: None,
                work_node_title: None,
                meeting_id: Some(meeting_id.clone()),
                run_id: None,
            },
        );
        crate::agent_activity::emit_step_start(
            &mut guard,
            Some(&app),
            &session_id,
            &turn_plan.speaker_id,
            &turn_step,
        );
        session_id
    };

    let progress = ProgressReporter::new(app.clone(), "meeting_advance");
    progress.emit_indeterminate(
        format!("Waiting for {speaker_name} · {provider_label}"),
        Some("llm"),
    );

    // Pre-check afford + clone settings under a short lock — never hold AppState
    // during the HTTP stream (that froze the UI and blocked token display).
    let (settings_clone, hub_clone, stream_enabled, agent_id_for_bill) = {
        let mut guard = state.lock_or_recover()?;
        if !guard.settings.pure_local_mode {
            let estimate = crate::ai::token_estimate::estimate_request(&chat_request);
            crate::token_budget::can_afford(&mut guard, &turn_plan.speaker_id, estimate)?;
        }
        (
            guard.settings.clone(),
            guard.hub.clone(),
            guard.settings.agent_activity_stream_enabled,
            turn_plan.speaker_id.clone(),
        )
    };
    let _ = stream_enabled;

    let app_for_blocking = app.clone();
    let session_for_blocking = session_id.clone();
    let speaker_for_blocking = turn_plan.speaker_id.clone();
    let department_for_blocking = speaker_department.clone();
    let agent_override_for_blocking = speaker_ai_provider.clone();
    let department_providers_for_blocking = department_providers.clone();
    let progress_for_blocking = ProgressReporter::new(app.clone(), "meeting_advance");

    let response = tokio::task::spawn_blocking(move || {
        crate::ai::streaming::chat_stream_unlocked(
            &app_for_blocking,
            &settings_clone,
            &hub_clone,
            &department_providers_for_blocking,
            agent_override_for_blocking.as_deref(),
            BilledChatRequest {
                request: chat_request,
                agent_id: speaker_for_blocking,
                department: department_for_blocking,
                source: "meeting_advance".into(),
            },
            &session_for_blocking,
            Some(&progress_for_blocking),
        )
    })
    .await
    .map_err(|e| e.to_string())?;

    let response = match response {
        Ok(r) => r,
        Err(error) => {
            // Surface failure on the activity stream + free the UI.
            {
                let mut guard = state.lock_or_recover()?;
                crate::agent_activity::emit_error(
                    &mut guard,
                    Some(&app),
                    &session_id,
                    &turn_plan.speaker_id,
                    &error,
                );
                crate::agent_activity::end_session(
                    &mut guard,
                    Some(&app),
                    &session_id,
                    crate::agent_activity::SessionStatus::Failed,
                    Some(error.clone()),
                );
            }
            progress.emit_indeterminate(format!("Meeting turn failed: {error}"), Some("llm"));
            crate::app_log::log_error_detail(
                &app,
                crate::app_log::LogCategory::Meeting,
                "advance_meeting",
                "Meeting turn LLM/stream failed",
                &error,
            );
            // Keep error visible briefly, then clear so the user can click again.
            progress.clear();
            return Err(error);
        }
    };

    // Apply turn under AppState. MutexGuard is !Send — never hold across .await.
    // Extract apply into a sync fn so the async loop only awaits when the lock is free.
    let mut attempts = 0u32;
    let snapshot = loop {
        match try_apply_meeting_turn(
            &state,
            &app,
            &progress,
            &meeting_id,
            &turn_plan,
            &response,
            &session_id,
            &turn_step,
            expected_turn,
            expected_completed,
            &agent_id_for_bill,
            &speaker_department,
        ) {
            ApplyTurnResult::Done(snapshot) => break snapshot,
            ApplyTurnResult::Failed(err) => {
                progress.clear();
                return Err(err);
            }
            ApplyTurnResult::Busy => {
                attempts += 1;
                if attempts == 1 || attempts % 10 == 0 {
                    progress.emit_indeterminate(
                        format!("Waiting for app lock… ({attempts}/100)"),
                        Some("llm"),
                    );
                }
                if attempts >= 100 {
                    progress.clear();
                    crate::app_log::log_error(
                        &app,
                        crate::app_log::LogCategory::Meeting,
                        "advance_meeting",
                        "Timed out waiting for app lock after meeting turn (worker busy)",
                    );
                    return Err(
                        "Timed out waiting for app lock after meeting turn (worker busy). Try Next Turn again."
                            .into(),
                    );
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
        }
    };

    Ok(snapshot)
}

enum ApplyTurnResult {
    Done(MeetingSnapshot),
    Failed(String),
    Busy,
}

fn try_apply_meeting_turn(
    state: &State<'_, Mutex<AppState>>,
    app: &AppHandle,
    progress: &ProgressReporter,
    meeting_id: &str,
    turn_plan: &MeetingTurnPlan,
    response: &crate::ai::provider::ChatResponse,
    session_id: &str,
    turn_step: &str,
    expected_turn: usize,
    expected_completed: bool,
    agent_id_for_bill: &str,
    speaker_department: &str,
) -> ApplyTurnResult {
    let mut state = match state.try_lock() {
        Ok(g) => g,
        Err(std::sync::TryLockError::Poisoned(p)) => {
            crate::app_log::log_warn(&app, crate::app_log::LogCategory::Meeting, "advance_meeting", "Recovered poisoned AppState after stream");
            p.into_inner()
        }
        Err(std::sync::TryLockError::WouldBlock) => return ApplyTurnResult::Busy,
    };

    progress.emit_indeterminate("Recording turn…", Some("llm"));

    if !state.settings.pure_local_mode {
        let _ = crate::token_budget::charge_tokens(
            &mut state,
            crate::token_budget::ChargeContext {
                source: "meeting_advance".into(),
                agent_id: agent_id_for_bill.to_string(),
                department: speaker_department.to_string(),
                provider: response.provider.clone(),
                prompt_tokens: response.usage.prompt_tokens,
                completion_tokens: response.usage.completion_tokens,
                total_tokens: response.usage.total_tokens,
                usage_source: response.usage.source,
            },
        );
    }

    let meeting_snapshot = {
        let meeting = match state.meetings.get_mut(meeting_id) {
            Some(m) => m,
            None => return ApplyTurnResult::Failed("Meeting not found.".into()),
        };
        if meeting.completed != expected_completed || meeting.turn != expected_turn {
            return ApplyTurnResult::Failed(
                "Meeting advanced elsewhere while waiting for AI. Refresh and try again.".into(),
            );
        }
        let content = response.content.clone();
        meeting.messages.push(MeetingMessage {
            speaker_id: turn_plan.speaker_id.clone(),
            speaker_name: turn_plan.speaker_name.clone(),
            content: content.clone(),
            provider: Some(response.provider.clone()),
        });
        meeting.turn += 1;
        (meeting.clone(), content)
    };

    let speaker_id = turn_plan.speaker_id.clone();
    crate::agent_activity::emit_step_complete(
        &mut state,
        Some(app),
        session_id,
        &speaker_id,
        turn_step,
        &meeting_snapshot.1,
    );
    let response_content = meeting_snapshot.1.clone();
    let meeting_only = meeting_snapshot.0;
    crate::agent_activity::end_session(
        &mut state,
        Some(app),
        session_id,
        crate::agent_activity::SessionStatus::Completed,
        Some(response_content),
    );
    if let Some(agent) = state.agents.get_mut(&speaker_id) {
        agent.status = "meeting".to_string();
    }

    let turns_per_agent = state.settings.meeting_turns_per_agent;
    let active_provider = crate::ai::configured_meeting_provider(&state.settings);
    let light_status = MeetingAiStatus {
        configured_provider: state.settings.ai_provider.clone(),
        active_provider: active_provider.clone(),
        ollama_reachable: false,
        hub_configured: false,
        hub_reachable: false,
        ollama_model: state.settings.ollama_model.clone(),
        ollama_base_url: state.settings.ollama_base_url.clone(),
        meeting_turns_per_agent: turns_per_agent,
        fallback_enabled: state.settings.meeting_llm_fallback,
        message: format!("Meeting turn recorded · {active_provider}"),
    };
    let mut snapshot = snapshot_from_meeting(&meeting_only, &light_status, turns_per_agent);

    let should_complete = {
        let turns = state.settings.meeting_turns_per_agent.max(1) as usize;
        state
            .meetings
            .get(meeting_id)
            .is_some_and(|m| !m.completed && m.turn >= m.participant_ids.len() * turns)
    };
    if should_complete {
        // Use a non-llm phase so the LIVE stream dock does not linger on other pages.
        progress.emit_indeterminate("Closing meeting — backlog & tasks…", Some("meeting_close"));
        match finalize_meeting_locked(&mut state, app, meeting_id) {
            Ok(closed) => snapshot = closed,
            Err(e) => {
                progress.clear();
                return ApplyTurnResult::Failed(e);
            }
        }
        // Drop progress immediately so navigating away never leaves a zombie dock.
        progress.finish("Meeting closed");
        progress.clear();
    } else {
        progress.finish("Done");
        progress.clear();
    }
    if let Err(error) = commit(app.clone(), &state) {
        crate::app_log::log_error(app, crate::app_log::LogCategory::Meeting, "advance_meeting_commit", format!("commit after turn failed: {error}"));
    }
    ApplyTurnResult::Done(snapshot)
}

struct MeetingTurnPlan {
    speaker_id: String,
    speaker_name: String,
    speaker_department: String,
    speaker_ai_provider: Option<String>,
    department_ai_providers: std::collections::HashMap<String, String>,
    chat_request: ChatRequest,
    settings: crate::state::GameSettings,
}

fn prepare_meeting_turn(state: &AppState, meeting: &MeetingState) -> Result<MeetingTurnPlan, String> {
    let speaker_id = meeting.participant_ids[meeting.turn % meeting.participant_ids.len()].clone();
    let speaker = state
        .agents
        .get(&speaker_id)
        .ok_or_else(|| "Speaker not found.".to_string())?
        .clone();

    let roster = meeting
        .participant_ids
        .iter()
        .filter_map(|agent_id| {
            state.agents.get(agent_id).map(|agent| {
                format!(
                    "- {} ({}, {})",
                    agent.name, agent.role, agent.department
                )
            })
        })
        .collect::<Vec<_>>()
        .join("\n");

    let relationship_context = relationship_context_for_participants(state, &meeting.participant_ids);
    let project_context = state
        .projects
        .iter()
        .map(|project| {
            format!(
                "- {} ({:.0}% complete, priority {})",
                project.title,
                project.progress * 100.0,
                project.priority
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let lang = crate::i18n::language_from_settings(&state.settings);
    let lang_block = crate::i18n::language_instruction(lang);
    let meet_lang = crate::i18n::meeting_language_instruction(lang);

    let meeting_context = format!(
        "{lang_block}\n\n{meet_lang}\n\n\
Company: {}\nMeeting type: {}\nParticipants:\n{roster}\nRelationships:\n{relationship_context}\nActive projects:\n{project_context}\n\
Speak as this agent in the company language only (2–4 short sentences or bullets). Reference teammates by name when useful.",
        state.company_name, meeting.meeting_type
    );

    let (persona, context) = build_chat_parts_for_agent(
        speaker.soul.as_ref(),
        &speaker.name,
        &speaker.role,
        &speaker.department,
        &meeting_context,
    );
    let conversation_turns: Vec<ChatTurn> = meeting
        .messages
        .iter()
        .map(|message| ChatTurn {
            role: if message.speaker_id == speaker.id {
                "assistant".to_string()
            } else {
                "user".to_string()
            },
            content: format!("{}: {}", message.speaker_name, message.content),
        })
        .collect();

    let history = meeting
        .messages
        .iter()
        .map(|message| format!("{}: {}", message.speaker_name, message.content))
        .collect::<Vec<_>>()
        .join("\n");

    let user_prompt = if history.is_empty() {
        format!(
            "{meet_lang}\n\n\
{} opens the {} meeting with a concrete update about priorities and blockers. \
Speak only in the company language. No English meta-planning.",
            speaker.name, meeting.meeting_type
        )
    } else {
        format!(
            "{meet_lang}\n\n\
Meeting transcript so far:\n{history}\n\n\
Now {} continues the {} meeting: reference prior points and propose next actions. \
Speak only in the company language. No English meta-planning.",
            speaker.name, meeting.meeting_type
        )
    };

    Ok(MeetingTurnPlan {
        speaker_id: speaker.id.clone(),
        speaker_name: speaker.name.clone(),
        speaker_department: speaker.department.clone(),
        speaker_ai_provider: speaker.ai_provider.clone(),
        department_ai_providers: state.department_ai_providers.clone(),
        chat_request: ChatRequest {
            system_prompt: format!("{lang_block}\n\n{meet_lang}\n\n{persona}"),
            context: Some(context),
            user_prompt,
            temperature: temperature_for_meeting(&meeting.meeting_type),
            soul_id: speaker.soul_id,
            conversation_turns,
        },
        settings: state.settings.clone(),
    })
}

async fn finalize_meeting(
    meeting_id: &str,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<MeetingSnapshot, String> {
    let mut state = state.lock_or_recover()?;
    let snapshot = finalize_meeting_locked(&mut state, &app, meeting_id)?;
    commit(app, &state)?;
    Ok(snapshot)
}

/// Close meeting, extract action items → backlog/tasks, plan sprint, optionally start work.
fn finalize_meeting_locked(
    state: &mut AppState,
    app: &AppHandle,
    meeting_id: &str,
) -> Result<MeetingSnapshot, String> {
    let meeting_type = state
        .meetings
        .get(meeting_id)
        .map(|meeting| meeting.meeting_type.clone())
        .ok_or_else(|| "Meeting not found.".to_string())?;

    let transcript = state
        .meetings
        .get(meeting_id)
        .map(|m| {
            m.messages
                .iter()
                .map(|msg| format!("{}: {}", msg.speaker_name, msg.content))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();

    let participant_ids = state
        .meetings
        .get(meeting_id)
        .map(|meeting| meeting.participant_ids.clone())
        .ok_or_else(|| "Meeting not found.".to_string())?;
    let participant_names: Vec<String> = participant_ids
        .iter()
        .filter_map(|id| state.agents.get(id).map(|a| a.name.clone()))
        .collect();

    let lang = crate::i18n::language_from_settings(&state.settings);
    let (progress_delta, revenue_delta, canned, spawn_project) =
        meeting_outcome_plan(lang, &meeting_type);

    // Heuristic minutes only while AppState may be locked — never call a live LLM polish
    // here (DeepSeek could hang for minutes and freeze the whole UI + leave "Closing meeting…" dock).
    let mut minutes = crate::meeting::build_minutes_heuristic(
        &meeting_type,
        &participant_names,
        &transcript,
        &canned,
        lang,
    );

    let action_items = minutes.action_items.clone();
    let mut outcome_summary = minutes.outcome_summary.clone();
    if spawn_project {
        let flag = match lang {
            crate::i18n::AppLanguage::En => " New initiative flagged from strategy discussion.",
            crate::i18n::AppLanguage::ZhHant => " 策略討論已標記新計劃。",
            crate::i18n::AppLanguage::ZhHans => " 策略讨论已标记新计划。",
        };
        outcome_summary.push_str(flag);
        minutes.outcome_summary = outcome_summary.clone();
    }

    {
        let meeting = state
            .meetings
            .get_mut(meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?;
        meeting.completed = true;
        meeting.project_progress_delta = progress_delta;
        meeting.revenue_delta = revenue_delta;
        meeting.outcome_summary = Some(outcome_summary.clone());
        meeting.key_points = minutes.key_points.clone();
        meeting.decisions = minutes.decisions.clone();
        meeting.action_items = minutes.action_items.clone();
        meeting.risks_blockers = minutes.risks_blockers.clone();
        meeting.notes_write_error = None;
        meeting.completed_at = Some(chrono::Utc::now().to_rfc3339());
        if meeting.started_at.is_none() {
            meeting.started_at = Some(chrono::Utc::now().to_rfc3339());
        }
    }

    let morale_delta = state
        .meetings
        .get(meeting_id)
        .map(|meeting| meeting.morale_delta)
        .unwrap_or(0.05);

    // Project progress / tokens, then real backlog work from the transcript.
    apply_meeting_outcome_to_state(state, &meeting_type, &outcome_summary);
    let spawn = crate::scrum::spawn_meeting_work(
        state,
        &meeting_type,
        &outcome_summary,
        &action_items,
        &participant_ids,
    );
    if let Some(ref spawn) = spawn {
        if let Some(meeting) = state.meetings.get_mut(meeting_id) {
            meeting.story_id = spawn.story_id.clone();
            meeting.task_ids = spawn.task_ids.clone();
            meeting.directive_id = Some(spawn.directive.id.clone());
        }
        minutes.task_ids = spawn.task_ids.clone();
    }
    apply_meeting_relationship_effects(state, &meeting_type, &participant_ids);

    for agent_id in &participant_ids {
        if let Some(agent) = state.agents.get_mut(agent_id) {
            agent.morale = (agent.morale + morale_delta).min(1.0);
            agent.status = "idle".to_string();
        }
    }

    state.stats.meetings_completed += 1;
    if let Err(error) =
        write_meeting_notes_from_state(app, state, meeting_id, Some(&minutes))
    {
        crate::app_log::log_error(
            app,
            crate::app_log::LogCategory::Meeting,
            "write_meeting_notes",
            format!("Failed to write meeting notes: {error}"),
        );
        if let Some(meeting) = state.meetings.get_mut(meeting_id) {
            meeting.notes_write_error = Some(error);
        }
    }

    // Do NOT run execution LLM here — that re-entered the model while the meeting dock
    // still said "saving" and could hang for minutes. Tasks are queued; worker executes.
    let work_started = state.settings.scrum_auto_execute
        && !state.settings.scrum_execution_paused
        && spawn.as_ref().is_some_and(|s| s.tasks_spawned > 0);

    let turns_per_agent = state.settings.meeting_turns_per_agent;
    let active_provider = crate::ai::configured_meeting_provider(&state.settings);
    let light_status = MeetingAiStatus {
        configured_provider: state.settings.ai_provider.clone(),
        active_provider: active_provider.clone(),
        ollama_reachable: false,
        hub_configured: false,
        hub_reachable: false,
        ollama_model: state.settings.ollama_model.clone(),
        ollama_base_url: state.settings.ollama_base_url.clone(),
        meeting_turns_per_agent: turns_per_agent,
        fallback_enabled: state.settings.meeting_llm_fallback,
        message: format!("Meeting closed · {active_provider}"),
    };
    let mut snapshot = snapshot_from_meeting(
        state
            .meetings
            .get(meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?,
        &light_status,
        turns_per_agent,
    );
    if let Some(spawn) = spawn {
        snapshot.tasks_spawned = spawn.tasks_spawned;
        snapshot.directive_id = Some(spawn.directive.id.clone());
        snapshot.story_id = spawn.story_id.clone();
        snapshot.task_ids = spawn.task_ids.clone();
        if let Some(summary) = snapshot.outcome_summary.as_mut() {
            summary.push_str(&format!(
                " · {} task(s) added to backlog/sprint.",
                spawn.tasks_spawned
            ));
        }
        if let Some(meeting) = state.meetings.get_mut(meeting_id) {
            meeting.outcome_summary = snapshot.outcome_summary.clone();
        }
    }
    if let Some(meeting) = state.meetings.get(meeting_id) {
        snapshot.action_task_links = build_action_links(meeting, state);
        snapshot.started_at = meeting.started_at.clone();
        snapshot.completed_at = meeting.completed_at.clone();
    }
    snapshot.work_started = work_started;
    Ok(snapshot)
}

// Legacy helper kept for any remaining call sites — prefer meeting::extract_action_items.
fn extract_action_items_from_transcript(transcript: &str) -> Vec<String> {
    crate::meeting::extract_action_items(transcript)
}

#[allow(dead_code)]
fn build_outcome_summary(
    meeting_type: &str,
    canned: &str,
    _action_items: &[String],
    transcript: &str,
) -> String {
    crate::meeting::build_minutes_heuristic(
        meeting_type,
        &[],
        transcript,
        canned,
        crate::i18n::AppLanguage::En,
    )
    .outcome_summary
}

fn relationship_context_for_participants(state: &AppState, participant_ids: &[String]) -> String {
    let lines = state
        .agent_relationships
        .iter()
        .filter(|edge| {
            participant_ids.contains(&edge.from_agent_id)
                && participant_ids.contains(&edge.to_agent_id)
        })
        .filter_map(|edge| {
            let left = state.agents.get(&edge.from_agent_id)?;
            let right = state.agents.get(&edge.to_agent_id)?;
            Some(format!(
                "- {} ↔ {}: {} ({:.0}%)",
                left.name,
                right.name,
                relationship_label(&edge.relationship_type, edge.score),
                edge.score * 100.0
            ))
        })
        .collect::<Vec<_>>();

    if lines.is_empty() {
        "No strong relationship history yet.".to_string()
    } else {
        lines.join("\n")
    }
}

fn temperature_for_meeting(meeting_type: &str) -> f32 {
    match meeting_type {
        "Crisis Meeting" => 0.55,
        "Strategy Discussion" => 0.8,
        "Team Building" => 0.85,
        _ => 0.75,
    }
}

fn apply_meeting_relationship_effects(
    state: &mut AppState,
    meeting_type: &str,
    participant_ids: &[String],
) {
    if participant_ids.len() < 2 {
        return;
    }

    let delta = match meeting_type {
        "Team Building" => 0.08,
        "Crisis Meeting" => -0.04,
        "Strategy Discussion" => 0.05,
        _ => 0.03,
    };

    for left_index in 0..participant_ids.len() {
        for right_index in (left_index + 1)..participant_ids.len() {
            let left = &participant_ids[left_index];
            let right = &participant_ids[right_index];
            let current = state
                .agent_relationships
                .iter()
                .find(|edge| {
                    (edge.from_agent_id == *left || edge.from_agent_id == *right)
                        && (edge.to_agent_id == *left || edge.to_agent_id == *right)
                })
                .map(|edge| edge.score)
                .unwrap_or(0.45);
            let next = (current + delta).clamp(-1.0, 1.0);
            let relationship_type = if next >= 0.65 {
                "friend"
            } else if next < 0.25 {
                "tense"
            } else {
                "neutral"
            };
            upsert_relationship(state, left, right, relationship_type, next);
        }
    }
}

fn morale_delta_for_type(meeting_type: &str) -> f32 {
    match meeting_type {
        "Crisis Meeting" => -0.03,
        "Team Building" => 0.12,
        "Strategy Discussion" => 0.08,
        "Project Kickoff" => 0.06,
        _ => 0.05,
    }
}

fn meeting_outcome_plan(
    lang: crate::i18n::AppLanguage,
    meeting_type: &str,
) -> (f32, f64, String, bool) {
    let (progress, revenue, spawn) = match meeting_type {
        "Daily Standup" => (0.03, 0.0, false),
        "Project Kickoff" => (0.08, 120.0, false),
        "Crisis Meeting" => (0.02, -80.0, false),
        "Team Building" => (0.01, 0.0, false),
        "Strategy Discussion" => (0.05, 200.0, true),
        _ => (0.04, 50.0, false),
    };
    (
        progress,
        revenue,
        crate::i18n::meeting_canned_outcome(lang, meeting_type),
        spawn,
    )
}

fn apply_meeting_outcome_to_state(state: &mut AppState, meeting_type: &str, _outcome_summary: &str) {
    let lang = crate::i18n::language_from_settings(&state.settings);
    let (progress_delta, revenue_delta, _, spawn_project) = meeting_outcome_plan(lang, meeting_type);

    if let Some(project) = state
        .projects
        .iter_mut()
        .max_by(|left, right| {
            left.priority
                .cmp(&right.priority)
                .then(left.progress.partial_cmp(&right.progress).unwrap_or(std::cmp::Ordering::Equal))
        })
    {
        project.progress = (project.progress + progress_delta).min(1.0);
    }

    let revenue_tokens = revenue_delta.round().max(0.0) as u64;
    state.token_economy.monthly_inflow_tokens = state
        .token_economy
        .monthly_inflow_tokens
        .saturating_add(revenue_tokens);
    let bonus = (revenue_delta * 0.25).round().max(0.0) as u64;
    crate::token_budget::top_up_company_tokens(state, bonus);

    // Work spawning is handled by spawn_meeting_work in finalize_meeting_locked.

    if spawn_project && state.projects.len() < 6 {
        let pm_agent_id = state.default_pm_agent_id.clone();
        state.projects.push(InternalProject {
            id: format!("proj-{}", Uuid::new_v4()),
            title: "New initiative from strategy meeting".into(),
            progress: 0.05,
            priority: 3,
            owner_department: "Executive".into(),
            description: "Spawned from a strategy meeting.".into(),
            pm_agent_id,
            active_sprint_id: None,
            default_cycle_days: 14,
        });
    }
}

fn snapshot_from_meeting(
    meeting: &MeetingState,
    ai_status: &MeetingAiStatus,
    turns_per_agent: u32,
) -> MeetingSnapshot {
    MeetingSnapshot {
        id: meeting.id.clone(),
        meeting_type: meeting.meeting_type.clone(),
        participant_ids: meeting.participant_ids.clone(),
        messages: meeting.messages.clone(),
        completed: meeting.completed,
        morale_delta: meeting.morale_delta,
        outcome_summary: meeting.outcome_summary.clone(),
        project_progress_delta: meeting.project_progress_delta,
        revenue_delta: meeting.revenue_delta,
        active_provider: ai_status.active_provider.clone(),
        turns_per_agent,
        notes_page_id: meeting.notes_page_id.clone(),
        tasks_spawned: meeting.task_ids.len() as u32,
        directive_id: meeting.directive_id.clone(),
        work_started: false,
        key_points: meeting.key_points.clone(),
        decisions: meeting.decisions.clone(),
        action_items: meeting.action_items.clone(),
        risks_blockers: meeting.risks_blockers.clone(),
        notes_write_error: meeting.notes_write_error.clone(),
        started_at: meeting.started_at.clone(),
        completed_at: meeting.completed_at.clone(),
        story_id: meeting.story_id.clone(),
        task_ids: meeting.task_ids.clone(),
        action_task_links: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppState;

    #[test]
    fn builds_meeting_turn_with_relationship_context() {
        let mut state = AppState::default();
        state.seed_defaults();
        let meeting = MeetingState {
            id: "meet-1".into(),
            meeting_type: "Daily Standup".into(),
            participant_ids: vec!["agent-1".into(), "agent-2".into()],
            messages: Vec::new(),
            turn: 0,
            completed: false,
            morale_delta: 0.05,
            outcome_summary: None,
            project_progress_delta: 0.0,
            revenue_delta: 0.0,
            notes_generated: false,
            notes_page_id: None,
            key_points: Vec::new(),
            decisions: Vec::new(),
            action_items: Vec::new(),
            risks_blockers: Vec::new(),
            notes_write_error: None,
            started_at: None,
            completed_at: None,
            story_id: None,
            task_ids: Vec::new(),
            directive_id: None,
        };

        let plan = prepare_meeting_turn(&state, &meeting).expect("meeting turn");
        assert!(plan.chat_request.system_prompt.contains("Mira"));
        assert!(
            plan.chat_request
                .context
                .as_deref()
                .unwrap_or("")
                .contains("Relationships")
        );
    }
}