use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct NearTxPayload {
    pub receiver_id: String,
    pub amount: String,
    pub memo: Option<String>,
}

#[tauri::command]
pub fn sign_near_transaction(_tx_payload: NearTxPayload) -> Result<String, String> {
    Err("NEAR signing is not available until Phase 5".to_string())
}

#[tauri::command]
pub fn submit_gig_to_hub(_gig_data: serde_json::Value) -> Result<String, String> {
    Err("Gig submission is not available until Phase 5".to_string())
}
