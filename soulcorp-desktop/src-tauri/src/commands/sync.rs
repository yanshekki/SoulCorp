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
pub fn sync_with_hub(_jwt_or_signature: String) -> Result<String, String> {
    Err("Hub sync is not available until Phase 5".to_string())
}
