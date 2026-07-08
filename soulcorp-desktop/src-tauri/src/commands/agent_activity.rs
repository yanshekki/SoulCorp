use crate::agent_activity::{backfill_if_needed, snapshot, AgentActivitySnapshot};
use crate::state::AppState;
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub fn list_agent_activity(
    limit: Option<u32>,
    state: State<'_, Mutex<AppState>>,
) -> Result<AgentActivitySnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
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
    let mut state = state.lock().map_err(|e| e.to_string())?;
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