use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct QueueStatus {
    pub pending_items: u32,
    pub last_sync_at: Option<String>,
}

#[tauri::command]
pub fn get_local_queue_status(state: State<'_, Mutex<AppState>>) -> Result<QueueStatus, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let pending_items = state.sync_queue.len() as u32;

    Ok(QueueStatus {
        pending_items,
        last_sync_at: state.hub.last_sync_at.clone(),
    })
}
