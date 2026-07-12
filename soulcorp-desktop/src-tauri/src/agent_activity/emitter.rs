use super::types::{
    ActivityKind, AgentActivityEvent, AgentActivityPayload, AgentActivitySession, AgentActivityStore,
    AgentActivitySnapshot, BrainLayer, DEFAULT_MAX_EVENTS, DEFAULT_MAX_SESSIONS, EVENT_NAME,
    NewSessionParams, SessionStatus,
};
use crate::state::AppState;
use serde_json::json;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn new_event_id() -> String {
    format!("act-{}", Uuid::new_v4())
}

fn new_session_id() -> String {
    format!("sess-{}", Uuid::new_v4())
}

pub fn max_events(state: &AppState) -> usize {
    state
        .settings
        .agent_activity_max_events
        .clamp(100, 1000) as usize
}

pub fn snapshot(store: &AgentActivityStore) -> AgentActivitySnapshot {
    AgentActivitySnapshot {
        sessions: store.sessions.clone(),
        events: store.events.clone(),
    }
}

/// Close zombie sessions that never finished (e.g. UI killed mid-stream).
/// Prevents Mind stream from sitting forever on "Waiting for tokens…".
pub fn fail_stale_active_sessions(state: &mut AppState, app: Option<&AppHandle>, max_age_secs: i64) {
    let now = chrono::Utc::now();
    let stale_ids: Vec<String> = state
        .agent_activity
        .sessions
        .iter()
        .filter(|s| s.status == SessionStatus::Active)
        .filter(|s| {
            chrono::DateTime::parse_from_rfc3339(&s.started_at)
                .ok()
                .map(|t| (now - t.with_timezone(&chrono::Utc)).num_seconds() > max_age_secs)
                .unwrap_or(false)
        })
        .map(|s| s.id.clone())
        .collect();

    for id in stale_ids {
        end_session(
            state,
            app,
            &id,
            SessionStatus::Failed,
            Some("Session timed out waiting for LLM tokens.".into()),
        );
    }
}

pub fn start_session(
    state: &mut AppState,
    app: Option<&AppHandle>,
    params: NewSessionParams,
) -> String {
    // 3 minutes is generous for a single meeting turn stream.
    fail_stale_active_sessions(state, app, 180);

    let session_id = new_session_id();
    let started_at = now_iso();
    let session = AgentActivitySession {
        id: session_id.clone(),
        agent_id: params.agent_id.clone(),
        agent_name: params.agent_name,
        source: params.source,
        brain_layer: params.brain_layer,
        brain_label: params.brain_label,
        transport: params.transport,
        work_node_id: params.work_node_id,
        work_node_title: params.work_node_title,
        meeting_id: params.meeting_id,
        run_id: params.run_id,
        status: SessionStatus::Active,
        started_at: started_at.clone(),
        finished_at: None,
    };

    let event = AgentActivityEvent {
        id: new_event_id(),
        session_id: session_id.clone(),
        agent_id: params.agent_id,
        kind: ActivityKind::SessionStart,
        timestamp: started_at,
        step: None,
        content_delta: None,
        content_full: Some(format!(
            "Session started · {} · {}",
            session.brain_label, session.transport
        )),
        metadata: json!({}),
    };

    push_session(state, session.clone());
    append_event(state, app, event, Some(session));
    session_id
}

pub fn end_session(
    state: &mut AppState,
    app: Option<&AppHandle>,
    session_id: &str,
    status: SessionStatus,
    summary: Option<String>,
) {
    let finished_at = now_iso();
    let mut session_snapshot: Option<AgentActivitySession> = None;
    if let Some(session) = state
        .agent_activity
        .sessions
        .iter_mut()
        .find(|s| s.id == session_id)
    {
        session.status = status;
        session.finished_at = Some(finished_at.clone());
        session_snapshot = Some(session.clone());
    }

    let agent_id = session_snapshot
        .as_ref()
        .map(|s| s.agent_id.clone())
        .unwrap_or_else(|| "unknown".to_string());

    let event = AgentActivityEvent {
        id: new_event_id(),
        session_id: session_id.to_string(),
        agent_id,
        kind: ActivityKind::SessionEnd,
        timestamp: finished_at,
        step: None,
        content_delta: None,
        content_full: summary,
        metadata: json!({ "status": format!("{:?}", status) }),
    };
    append_event(state, app, event, session_snapshot);
}

pub fn emit_step_start(
    state: &mut AppState,
    app: Option<&AppHandle>,
    session_id: &str,
    agent_id: &str,
    step: &str,
) {
    let event = AgentActivityEvent {
        id: new_event_id(),
        session_id: session_id.to_string(),
        agent_id: agent_id.to_string(),
        kind: ActivityKind::StepStart,
        timestamp: now_iso(),
        step: Some(step.to_string()),
        content_delta: None,
        content_full: None,
        metadata: json!({}),
    };
    append_event(state, app, event, None);
}

pub fn emit_step_complete(
    state: &mut AppState,
    app: Option<&AppHandle>,
    session_id: &str,
    agent_id: &str,
    step: &str,
    content: &str,
) {
    let event = AgentActivityEvent {
        id: new_event_id(),
        session_id: session_id.to_string(),
        agent_id: agent_id.to_string(),
        kind: ActivityKind::StepComplete,
        timestamp: now_iso(),
        step: Some(step.to_string()),
        content_delta: None,
        content_full: Some(content.to_string()),
        metadata: json!({}),
    };
    append_event(state, app, event, None);
}

pub fn emit_token_delta(
    state: &mut AppState,
    app: Option<&AppHandle>,
    session_id: &str,
    agent_id: &str,
    step: Option<&str>,
    delta: &str,
    reasoning: bool,
) {
    if delta.is_empty() {
        return;
    }
    let event = AgentActivityEvent {
        id: new_event_id(),
        session_id: session_id.to_string(),
        agent_id: agent_id.to_string(),
        kind: ActivityKind::TokenDelta,
        timestamp: now_iso(),
        step: step.map(str::to_string),
        content_delta: Some(delta.to_string()),
        content_full: None,
        metadata: json!({ "reasoning": reasoning }),
    };
    append_event(state, app, event, None);
}

/// Fire token deltas to the UI **without** holding AppState.
/// Used while the HTTP stream runs unlocked so the window stays interactive
/// and tokens appear as soon as the provider sends them.
pub fn emit_token_delta_live(
    app: Option<&AppHandle>,
    session_id: &str,
    agent_id: &str,
    step: Option<&str>,
    delta: &str,
    reasoning: bool,
) {
    if delta.is_empty() {
        return;
    }
    let Some(handle) = app else {
        return;
    };
    let event = AgentActivityEvent {
        id: new_event_id(),
        session_id: session_id.to_string(),
        agent_id: agent_id.to_string(),
        kind: ActivityKind::TokenDelta,
        timestamp: now_iso(),
        step: step.map(str::to_string),
        content_delta: Some(delta.to_string()),
        content_full: None,
        metadata: json!({ "reasoning": reasoning }),
    };
    let payload = AgentActivityPayload {
        event,
        session: None,
    };
    let _ = handle.emit(EVENT_NAME, &payload);
}

/// Push the full turn text to the UI once (covers missed deltas / non-stream paths).
pub fn emit_content_full_live(
    app: Option<&AppHandle>,
    session_id: &str,
    agent_id: &str,
    step: Option<&str>,
    content: &str,
) {
    if content.trim().is_empty() {
        return;
    }
    let Some(handle) = app else {
        return;
    };
    let event = AgentActivityEvent {
        id: new_event_id(),
        session_id: session_id.to_string(),
        agent_id: agent_id.to_string(),
        kind: ActivityKind::StepComplete,
        timestamp: now_iso(),
        step: step.map(str::to_string),
        content_delta: None,
        content_full: Some(content.to_string()),
        metadata: json!({ "live_full": true }),
    };
    let payload = AgentActivityPayload {
        event,
        session: None,
    };
    let _ = handle.emit(EVENT_NAME, &payload);
}

pub fn emit_terminal_line(
    state: &mut AppState,
    app: Option<&AppHandle>,
    session_id: &str,
    agent_id: &str,
    line: &str,
    stream: &str,
) {
    if line.trim().is_empty() {
        return;
    }
    let event = AgentActivityEvent {
        id: new_event_id(),
        session_id: session_id.to_string(),
        agent_id: agent_id.to_string(),
        kind: ActivityKind::TerminalLine,
        timestamp: now_iso(),
        step: None,
        content_delta: Some(line.to_string()),
        content_full: None,
        metadata: json!({ "stream": stream }),
    };
    append_event(state, app, event, None);
}

pub fn emit_error(
    state: &mut AppState,
    app: Option<&AppHandle>,
    session_id: &str,
    agent_id: &str,
    message: &str,
) {
    let event = AgentActivityEvent {
        id: new_event_id(),
        session_id: session_id.to_string(),
        agent_id: agent_id.to_string(),
        kind: ActivityKind::Error,
        timestamp: now_iso(),
        step: None,
        content_delta: None,
        content_full: Some(message.to_string()),
        metadata: json!({}),
    };
    append_event(state, app, event, None);
}

pub fn emit_deliverable_ready(
    state: &mut AppState,
    app: Option<&AppHandle>,
    session_id: &str,
    agent_id: &str,
    page_id: &str,
    summary: &str,
) {
    let event = AgentActivityEvent {
        id: new_event_id(),
        session_id: session_id.to_string(),
        agent_id: agent_id.to_string(),
        kind: ActivityKind::DeliverableReady,
        timestamp: now_iso(),
        step: None,
        content_delta: None,
        content_full: Some(summary.to_string()),
        metadata: json!({ "page_id": page_id }),
    };
    append_event(state, app, event, None);
}

pub fn emit_autopilot_phase_change(
    state: &mut AppState,
    app: Option<&AppHandle>,
    previous_phase: &str,
    new_phase: &str,
    source: super::types::ActivitySource,
) {
    let session_id = "autopilot-system".to_string();
    let event = AgentActivityEvent {
        id: new_event_id(),
        session_id: session_id.clone(),
        agent_id: "system".to_string(),
        kind: ActivityKind::AutopilotPhaseChange,
        timestamp: now_iso(),
        step: None,
        content_delta: None,
        content_full: Some(format!("Autopilot: {previous_phase} → {new_phase}")),
        metadata: json!({
            "previous_phase": previous_phase,
            "new_phase": new_phase,
            "source": format!("{:?}", source).to_lowercase(),
        }),
    };
    append_event(state, app, event, None);
}

pub fn emit_worker_message(
    state: &mut AppState,
    app: Option<&AppHandle>,
    message: &str,
) {
    let session_id = "worker-system".to_string();
    let event = AgentActivityEvent {
        id: new_event_id(),
        session_id: session_id.clone(),
        agent_id: "system".to_string(),
        kind: ActivityKind::StatusChange,
        timestamp: now_iso(),
        step: None,
        content_delta: None,
        content_full: Some(message.to_string()),
        metadata: json!({ "source": "worker" }),
    };
    append_event(state, app, event, None);
}

fn push_session(state: &mut AppState, session: AgentActivitySession) {
    state.agent_activity.sessions.push(session);
    while state.agent_activity.sessions.len() > DEFAULT_MAX_SESSIONS {
        state.agent_activity.sessions.remove(0);
    }
}

fn append_event(
    state: &mut AppState,
    app: Option<&AppHandle>,
    event: AgentActivityEvent,
    session: Option<AgentActivitySession>,
) {
    let persist = state.settings.agent_activity_persist_stream;
    if persist {
        state.agent_activity.events.push(event.clone());
        let cap = max_events(state);
        while state.agent_activity.events.len() > cap {
            state.agent_activity.events.remove(0);
        }
    }

    if let Some(handle) = app {
        let payload = AgentActivityPayload { event, session };
        let _ = handle.emit(EVENT_NAME, &payload);
    }
}

pub fn resolve_brain_labels(
    state: &AppState,
    agent: &crate::state::AgentRecord,
    layer: BrainLayer,
) -> (String, String) {
    match layer {
        BrainLayer::Meeting => {
            let registry_id = crate::brain::resolve_meeting_registry_id(
                &state.settings,
                &state.department_ai_providers,
                &agent.department,
                agent.ai_provider.as_deref(),
            );
            let label = crate::brain::effective_meeting_label(
                &state.settings,
                &state.department_ai_providers,
                &agent.department,
                agent.ai_provider.as_deref(),
            );
            let transport = if registry_id == "mock" {
                "mock"
            } else {
                "api"
            };
            (label, transport.to_string())
        }
        BrainLayer::Execution => {
            let id = crate::brain::resolve_execution_runtime(
                &state.settings,
                &state.department_agent_runtimes,
                &agent.department,
                agent,
            );
            let label = crate::brain::effective_execution_label(&id);
            let transport = if crate::agent_runtime::is_subprocess_runtime(&id) {
                "subprocess"
            } else {
                "llm_only"
            };
            (label, transport.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_activity::types::ActivitySource;

    #[test]
    fn append_event_respects_ring_cap() {
        let mut state = AppState::default();
        state.settings.agent_activity_max_events = 100;
        for index in 0..120 {
            let event = AgentActivityEvent {
                id: format!("e-{index}"),
                session_id: "s-1".to_string(),
                agent_id: "a-1".to_string(),
                kind: ActivityKind::TokenDelta,
                timestamp: now_iso(),
                step: None,
                content_delta: Some("x".to_string()),
                content_full: None,
                metadata: json!({}),
            };
            append_event(&mut state, None, event, None);
        }
        assert_eq!(state.agent_activity.events.len(), 100);
        assert_eq!(state.agent_activity.events.first().map(|e| e.id.as_str()), Some("e-20"));
    }

    #[test]
    fn start_session_creates_active_session() {
        let mut state = AppState::default();
        let session_id = start_session(
            &mut state,
            None,
            NewSessionParams {
                agent_id: "agent-1".to_string(),
                agent_name: "Alex".to_string(),
                source: ActivitySource::Execution,
                brain_layer: BrainLayer::Execution,
                brain_label: "LLM only".to_string(),
                transport: "llm_only".to_string(),
                work_node_id: Some("task-1".to_string()),
                work_node_title: Some("Write spec".to_string()),
                meeting_id: None,
                run_id: Some("exec-1".to_string()),
            },
        );
        assert_eq!(state.agent_activity.sessions.len(), 1);
        assert_eq!(state.agent_activity.sessions[0].id, session_id);
        assert_eq!(state.agent_activity.events.len(), 1);
    }
}