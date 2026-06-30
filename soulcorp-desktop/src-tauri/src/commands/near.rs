use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct NearTxPayload {
    pub receiver_id: String,
    pub amount: String,
    pub memo: Option<String>,
}

#[tauri::command]
pub fn sign_near_transaction(tx_payload: NearTxPayload) -> Result<String, String> {
    Ok(format!(
        "NEAR tx prepared for {} amount {} (user confirmation required in UI)",
        tx_payload.receiver_id, tx_payload.amount
    ))
}
