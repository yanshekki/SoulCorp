use crate::hub::{mock_gigs, HubClient, HubGig, HubSyncPull};
use crate::state::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubConfigUpdate {
    pub base_url: Option<String>,
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateHubGigRequest {
    pub title: String,
    pub description: String,
    pub budget_usdt: f64,
    pub required_skills: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubStatus {
    pub connected: bool,
    pub base_url: String,
    pub user_tier: String,
    pub soul_balance: f64,
    pub pure_local_mode: bool,
    pub pending_queue_items: u32,
    pub last_sync_at: Option<String>,
}

fn client_from_state(state: &AppState) -> HubClient {
    HubClient::new(state.hub.base_url.clone(), state.hub.api_key.clone())
}

#[tauri::command]
pub fn get_hub_status(state: State<'_, Mutex<AppState>>) -> Result<HubStatus, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(HubStatus {
        connected: state.hub.connected,
        base_url: state.hub.base_url.clone(),
        user_tier: state.hub.user_tier.clone(),
        soul_balance: state.hub.soul_balance,
        pure_local_mode: state.settings.pure_local_mode,
        pending_queue_items: state.sync_queue.len() as u32,
        last_sync_at: state.hub.last_sync_at.clone(),
    })
}

#[tauri::command]
pub fn update_hub_config(
    update: HubConfigUpdate,
    state: State<'_, Mutex<AppState>>,
) -> Result<HubStatus, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    if let Some(base_url) = update.base_url {
        state.hub.base_url = base_url;
    }
    if let Some(api_key) = update.api_key {
        state.hub.api_key = if api_key.is_empty() {
            None
        } else {
            Some(api_key)
        };
    }
    drop(state);
    get_hub_status(state)
}

#[tauri::command]
pub async fn list_hub_gigs(state: State<'_, Mutex<AppState>>) -> Result<Vec<HubGig>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    if state.settings.pure_local_mode {
        return Ok(mock_gigs());
    }

    let client = client_from_state(&state);
    drop(state);

    match client.list_open_gigs().await {
        Ok(gigs) => Ok(gigs),
        Err(_) => Ok(mock_gigs()),
    }
}

#[tauri::command]
pub async fn create_hub_gig(
    request: CreateHubGigRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<serde_json::Value, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    if state.settings.pure_local_mode {
        return Err("Pure Local Mode is enabled. Marketplace actions are local-only.".to_string());
    }

    let payload = json!({
        "title": request.title,
        "description": request.description,
        "budget_usdt": request.budget_usdt,
        "required_skills": request.required_skills,
    });

    state.sync_queue.push(payload.clone());
    let client = client_from_state(&state);
    drop(state);

    client
        .create_gig(payload)
        .await
        .or_else(|_| Ok(json!({"gig_id": 9999, "status": "queued_locally"})))
}

#[tauri::command]
pub async fn sync_with_hub(state: State<'_, Mutex<AppState>>) -> Result<HubSyncPull, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    if state.settings.pure_local_mode {
        return Err("Pure Local Mode is enabled. Cloud sync is disabled.".to_string());
    }

    let client = client_from_state(&state);
    let queue = state.sync_queue.clone();
    drop(state);

    if !queue.is_empty() {
        let _ = client.push_sync(json!({ "queue": queue })).await;
    }

    let pull = client.pull_sync().await.unwrap_or(HubSyncPull {
        tier: "free".to_string(),
        soul_balance: 0.0,
        open_gigs: mock_gigs(),
    });

    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.hub.connected = true;
    state.hub.user_tier = pull.tier.clone();
    state.hub.soul_balance = pull.soul_balance;
    state.hub.last_sync_at = Some(Utc::now().to_rfc3339());
    state.sync_queue.clear();
    Ok(pull)
}

#[tauri::command]
pub async fn fetch_soul_balance(state: State<'_, Mutex<AppState>>) -> Result<HubStatus, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    if state.settings.pure_local_mode {
        state.hub.soul_balance = 0.0;
        state.hub.user_tier = "local".to_string();
        drop(state);
        return get_hub_status(state);
    }

    let client = client_from_state(&state);
    drop(state);

    if let Ok(body) = client.soul_balance().await {
        let mut state = state.lock().map_err(|e| e.to_string())?;
        state.hub.soul_balance = body
            .get("soul_balance")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        state.hub.user_tier = body
            .get("tier")
            .and_then(|v| v.as_str())
            .unwrap_or("free")
            .to_string();
        state.hub.connected = true;
    }

    get_hub_status(state)
}
