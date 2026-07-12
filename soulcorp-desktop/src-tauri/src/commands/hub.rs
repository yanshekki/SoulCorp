use crate::ai::{self, ProviderCredentialProbe};
use crate::db::persistence::commit;
use crate::hub::{filter_gigs_for_tier, HubClient, HubGig, HubSyncPull};
use crate::state::AppState;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

use crate::lock_util::MutexExt;
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubConfigUpdate {
    pub base_url: Option<String>,
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubGigListResult {
    pub gigs: Vec<HubGig>,
    pub from_cache: bool,
    pub message: Option<String>,
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
    pub soul_staked: f64,
    pub near_wallet_address: Option<String>,
    pub pure_local_mode: bool,
    pub pending_queue_items: u32,
    pub last_sync_at: Option<String>,
}

fn client_from_state(state: &AppState) -> HubClient {
    HubClient::new(state.hub.base_url.clone(), state.hub.api_key.clone())
}

fn hub_status_from(state: &AppState) -> HubStatus {
    HubStatus {
        connected: state.hub.connected,
        base_url: state.hub.base_url.clone(),
        user_tier: state.hub.user_tier.clone(),
        soul_balance: state.hub.soul_balance,
        soul_staked: state.hub.soul_staked,
        near_wallet_address: state.hub.near_wallet_address.clone(),
        pure_local_mode: state.settings.pure_local_mode,
        pending_queue_items: state.sync_queue.len() as u32,
        last_sync_at: state.hub.last_sync_at.clone(),
    }
}

#[tauri::command]
pub fn get_hub_status(state: State<'_, Mutex<AppState>>) -> Result<HubStatus, String> {
    let state = state.lock_or_recover()?;
    Ok(hub_status_from(&state))
}

/// Live-test hub URL + API key for the Cloud & hub green/red light.
#[tauri::command]
pub async fn test_hub_connection(app: AppHandle) -> Result<ProviderCredentialProbe, String> {
    tokio::task::spawn_blocking(move || {
        let state_mutex = app.state::<Mutex<AppState>>();
        let (settings, hub) = {
            let state = state_mutex.lock_or_recover()?;
            (state.settings.clone(), state.hub.clone())
        };
        let probe = ai::probe_hub_credentials(&settings, &hub);
        // Reflect live reachability on hub.connected for the rest of the app.
        if let Ok(mut state) = state_mutex.lock() {
            state.hub.connected = probe.ok && probe.has_credentials && !state.settings.pure_local_mode;
        }
        Ok(probe)
    })
    .await
    .map_err(|e| format!("hub probe task failed: {e}"))?
}

#[tauri::command]
pub fn update_hub_config(
    update: HubConfigUpdate,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<HubStatus, String> {
    {
        let mut state = app_state.lock_or_recover()?;
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
        commit(app, &state)?;
    }
    get_hub_status(app_state)
}

#[tauri::command]
pub async fn list_hub_gigs(
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<HubGigListResult, String> {
    let (client, tier, pure_local, cached_gigs) = {
        let state = app_state.lock_or_recover()?;
        let tier = state.hub.user_tier.clone();
        let pure_local = state.settings.pure_local_mode;
        let cached_gigs = state.hub.cached_open_gigs.clone();
        let client = if pure_local {
            None
        } else {
            Some(client_from_state(&state))
        };
        (client, tier, pure_local, cached_gigs)
    };

    let (gigs, from_cache, message) = if pure_local {
        (
            cached_gigs,
            true,
            Some("Showing cached gigs (Pure Local Mode).".to_string()),
        )
    } else if let Some(client) = client {
        match client.list_open_gigs().await {
            Ok(gigs) => {
                let mut state = app_state.lock_or_recover()?;
                state.hub.cached_open_gigs = gigs.clone();
                commit(app, &state)?;
                (gigs, false, None)
            }
            Err(error) => {
                if cached_gigs.is_empty() {
                    return Err(format!(
                        "Failed to load marketplace gigs: {error}. Sync with the hub when online."
                    ));
                }
                (
                    cached_gigs,
                    true,
                    Some(format!(
                        "Hub offline — showing cached gigs. Last error: {error}"
                    )),
                )
            }
        }
    } else {
        (Vec::new(), false, None)
    };

    Ok(HubGigListResult {
        gigs: filter_gigs_for_tier(gigs, &tier),
        from_cache,
        message,
    })
}

#[tauri::command]
pub async fn create_hub_gig(
    request: CreateHubGigRequest,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let (client, payload) = {
        let mut state = app_state.lock_or_recover()?;
        if state.settings.pure_local_mode {
            return Err(
                "Pure Local Mode is enabled. Marketplace actions are local-only.".to_string(),
            );
        }

        let payload = json!({
            "type": "gig_create",
            "title": request.title,
            "description": request.description,
            "budget_usdt": request.budget_usdt,
            "required_skills": request.required_skills,
        });

        crate::gigs::hub_sync::enqueue_gig_create(&mut state, payload.clone());
        commit(app.clone(), &state)?;
        (client_from_state(&state), payload)
    };

    let queued_title = request.title.clone();
    match client.create_gig(payload).await {
        Ok(response) => {
            let mut state = app_state.lock_or_recover()?;
            state.sync_queue.retain(|item| {
                item.get("type") != Some(&json!("gig_create"))
                    || item.get("title").and_then(|value| value.as_str()) != Some(queued_title.as_str())
            });
            commit(app.clone(), &state)?;
            Ok(response)
        }
        Err(error) => Ok(json!({
            "status": "queued_locally",
            "queued": true,
            "message": format!(
                "Hub unreachable. Gig saved locally and will sync on next hub connection: {error}"
            )
        })),
    }
}

#[tauri::command]
pub async fn sync_with_hub(
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<HubSyncPull, String> {
    let progress = crate::progress::ProgressReporter::new(app.clone(), "hub_sync");
    progress.emit_percent("Connecting to SoulMD Hub…", 30.0, Some("connect"));

    let client = {
        let state = app_state.lock_or_recover()?;
        if state.settings.pure_local_mode {
            return Err("Pure Local Mode is enabled. Cloud sync is disabled.".to_string());
        }
        client_from_state(&state)
    };

    {
        let mut state = app_state.lock_or_recover()?;
        let flush = crate::gigs::flush_pending_hub_gig_ops(&mut state);
        if flush.qc_submitted > 0
            || flush.gigs_assigned > 0
            || flush.gigs_started > 0
            || flush.gigs_completed > 0
            || flush.gigs_created > 0
            || flush.gigs_rejected > 0
            || flush.gigs_disputed > 0
        {
            let _ = crate::db::persistence::commit(app.clone(), &state);
        }
    }

    let queue = {
        let state = app_state.lock_or_recover()?;
        state.sync_queue.clone()
    };

    if !queue.is_empty() {
        progress.emit_percent("Pushing local changes…", 45.0, Some("push"));
        match client.push_sync(json!({ "queue": queue })).await {
            Ok(body) => {
                let processed = body
                    .get("processed")
                    .and_then(|value| value.as_u64())
                    .unwrap_or(0);
                if processed > 0 {
                    let mut state = app_state.lock_or_recover()?;
                    state.sync_queue.clear();
                    commit(app.clone(), &state)?;
                }
            }
            Err(error) => {
                let mut state = app_state.lock_or_recover()?;
                let _ = crate::gigs::flush_pending_hub_gig_ops(&mut state);
                commit(app.clone(), &state)?;
                if !state.sync_queue.is_empty() {
                    return Err(format!("Hub sync push failed: {error}"));
                }
            }
        }
    }

    progress.emit_percent("Pulling hub data…", 70.0, Some("pull"));
    let pull = client
        .pull_sync()
        .await
        .map_err(|error| format!("Hub sync pull failed: {error}"))?;

    {
        let mut state = app_state.lock_or_recover()?;
        state.hub.connected = true;
        state.hub.user_tier = pull.tier.clone();
        state.hub.soul_balance = pull.soul_balance;
        state.hub.cached_open_gigs = pull.open_gigs.clone();
        state.hub.last_sync_at = Some(Utc::now().to_rfc3339());
        commit(app, &state)?;
    }

    let tier = {
        let state = app_state.lock_or_recover()?;
        state.hub.user_tier.clone()
    };
    let mut pull = pull;
    pull.open_gigs = filter_gigs_for_tier(pull.open_gigs, &tier);
    progress.emit_percent("Hub sync complete", 100.0, Some("done"));
    progress.clear();
    Ok(pull)
}

#[tauri::command]
pub async fn fetch_soul_balance(
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<HubStatus, String> {
    let client = {
        let mut state = app_state.lock_or_recover()?;
        if state.settings.pure_local_mode {
            state.hub.soul_balance = 0.0;
            state.hub.user_tier = "local".to_string();
            commit(app.clone(), &state)?;
            None
        } else {
            Some(client_from_state(&state))
        }
    };

    let Some(client) = client else {
        return get_hub_status(app_state);
    };

    if let Ok(body) = client.soul_balance().await {
        let mut state = app_state.lock_or_recover()?;
        state.hub.soul_balance = body
            .get("soul_balance")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        state.hub.soul_staked = body
            .get("soul_staked")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        state.hub.user_tier = body
            .get("tier")
            .and_then(|v| v.as_str())
            .unwrap_or("free")
            .to_string();
        state.hub.near_wallet_address = body
            .get("near_wallet_address")
            .and_then(|v| v.as_str())
            .map(|value| value.to_string())
            .filter(|value| !value.is_empty());
        state.hub.connected = true;
        commit(app, &state)?;
    }

    get_hub_status(app_state)
}