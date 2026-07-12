use crate::agent_activity::{
    backfill_if_needed, snapshot, ActivityKind, AgentActivityEvent, AgentActivitySession,
    AgentActivitySnapshot,
};
use crate::commands::export::{exports_dir, ExportResult};
use crate::db::persistence::commit;
use crate::state::AppState;
use chrono::Utc;
use std::fs;
use std::sync::Mutex;
use tauri::{AppHandle, State};

use crate::lock_util::MutexExt;
#[tauri::command]
pub fn list_agent_activity(
    limit: Option<u32>,
    state: State<'_, Mutex<AppState>>,
) -> Result<AgentActivitySnapshot, String> {
    let mut state = state.lock_or_recover()?;
    backfill_if_needed(&mut state);
    let cap = limit.unwrap_or(200).clamp(1, 500) as usize;
    let snap = snapshot(&state.agent_activity);
    Ok(AgentActivitySnapshot {
        sessions: snap.sessions,
        events: snap
            .events
            .into_iter()
            .rev()
            .take(cap)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect(),
    })
}

#[tauri::command]
pub fn get_agent_session(
    session_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<AgentActivitySnapshot, String> {
    let mut state = state.lock_or_recover()?;
    backfill_if_needed(&mut state);
    let sessions: Vec<_> = state
        .agent_activity
        .sessions
        .iter()
        .filter(|session| session.id == session_id)
        .cloned()
        .collect();
    let events: Vec<_> = state
        .agent_activity
        .events
        .iter()
        .filter(|event| event.session_id == session_id)
        .cloned()
        .collect();
    Ok(AgentActivitySnapshot { sessions, events })
}

fn event_kind_label(kind: ActivityKind) -> &'static str {
    match kind {
        ActivityKind::SessionStart => "session_start",
        ActivityKind::SessionEnd => "session_end",
        ActivityKind::StatusChange => "status_change",
        ActivityKind::StepStart => "step_start",
        ActivityKind::StepComplete => "step_complete",
        ActivityKind::TokenDelta => "token_delta",
        ActivityKind::TerminalLine => "terminal_line",
        ActivityKind::ToolAction => "tool_action",
        ActivityKind::WorkAssigned => "work_assigned",
        ActivityKind::DeliverableReady => "deliverable_ready",
        ActivityKind::Error => "error",
        ActivityKind::AutopilotPhaseChange => "autopilot_phase",
    }
}

fn append_session_markdown(lines: &mut Vec<String>, session: &AgentActivitySession) {
    lines.push(format!("### {} · {}", session.agent_name, session.brain_label));
    lines.push(format!(
        "- Source: {:?} · Status: {:?} · Started: {}",
        session.source, session.status, session.started_at
    ));
    if let Some(title) = session.work_node_title.as_ref() {
        lines.push(format!("- Task: {title}"));
    }
    if let Some(finished) = session.finished_at.as_ref() {
        lines.push(format!("- Finished: {finished}"));
    }
    lines.push(String::new());
}

fn append_event_markdown(lines: &mut Vec<String>, event: &AgentActivityEvent) {
    let label = event_kind_label(event.kind);
    let mut line = format!("- `{label}` **{label}** @ {}", event.timestamp);
    if let Some(step) = event.step.as_ref() {
        line.push_str(&format!(" · step={step}"));
    }
    lines.push(line);
    if let Some(delta) = event.content_delta.as_ref().filter(|value| !value.is_empty()) {
        lines.push(format!("  > {delta}"));
    } else if let Some(full) = event.content_full.as_ref().filter(|value| !value.is_empty()) {
        for part in full.lines().take(12) {
            lines.push(format!("  > {part}"));
        }
    }
}

fn build_agent_activity_markdown(snap: &AgentActivitySnapshot, company_name: &str) -> String {
    let mut lines = vec![
        "# Agent Observatory Export".to_string(),
        String::new(),
        format!("Company: **{company_name}**"),
        format!("Exported: {}", Utc::now().to_rfc3339()),
        format!("Sessions: {} · Events: {}", snap.sessions.len(), snap.events.len()),
        String::new(),
        "## Sessions".to_string(),
        String::new(),
    ];

    for session in &snap.sessions {
        append_session_markdown(&mut lines, session);
    }

    lines.push("## Event log".to_string());
    lines.push(String::new());
    for event in &snap.events {
        append_event_markdown(&mut lines, event);
    }

    lines.join("\n")
}

#[tauri::command]
pub fn export_agent_activity_markdown(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<ExportResult, String> {
    let mut state = state.lock_or_recover()?;
    backfill_if_needed(&mut state);
    let snap = snapshot(&state.agent_activity);
    let company_name = if state.company_name.is_empty() {
        "SoulCorp".to_string()
    } else {
        state.company_name.clone()
    };
    let markdown = build_agent_activity_markdown(&snap, &company_name);

    let exports_dir = exports_dir(&app)?;
    fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let path = exports_dir.join(format!("observatory-export-{timestamp}.md"));
    fs::write(&path, markdown).map_err(|e| e.to_string())?;
    state.stats.exports_created += 1;

    let result = ExportResult {
        path: path.to_string_lossy().to_string(),
        format: "markdown".to_string(),
        message: "Observatory sessions exported.".to_string(),
    };
    commit(app, &state)?;
    Ok(result)
}