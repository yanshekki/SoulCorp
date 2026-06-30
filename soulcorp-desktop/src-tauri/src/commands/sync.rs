use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct QueueStatus {
    pub pending_items: u32,
    pub last_sync_at: Option<String>,
}

#[tauri::command]
pub fn get_local_queue_status() -> Result<QueueStatus, String> {
    Ok(QueueStatus {
        pending_items: 0,
        last_sync_at: None,
    })
}

#[tauri::command]
pub fn sync_with_hub(
    _jwt_or_signature: String,
    state: tauri::State<'_, std::sync::Mutex<crate::state::AppState>>,
) -> Result<String, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    if state.settings.pure_local_mode {
        return Err("Pure Local Mode is enabled. Cloud sync is disabled.".to_string());
    }
    Err("Hub sync is not available until Phase 5".to_string())
}
