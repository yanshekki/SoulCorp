use crate::db::persistence::commit;
use crate::gigs::{finalize_contract_at_index, payout_for_budget};
use crate::hub::{mock_gigs, HubClient, HubGig};
use crate::state::{AppState, GigContract};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcceptHubGigRequest {
    pub gig_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GigLifecycleRequest {
    pub contract_id: String,
}

fn client_from_state(state: &AppState) -> HubClient {
    HubClient::new(state.hub.base_url.clone(), state.hub.api_key.clone())
}

fn allow_mock_hub_fallback() -> bool {
    cfg!(debug_assertions)
}

async fn resolve_gig_for_accept(
    pure_local: bool,
    base_url: String,
    api_key: Option<String>,
    gig_id: u64,
) -> Result<HubGig, String> {
    if pure_local {
        return mock_gigs()
            .into_iter()
            .find(|gig| gig.gig_id == gig_id)
            .ok_or_else(|| format!("Gig {gig_id} not found in local marketplace."));
    }

    let client = HubClient::new(base_url, api_key);
    match client.list_open_gigs().await {
        Ok(gigs) => gigs
            .into_iter()
            .find(|gig| gig.gig_id == gig_id)
            .ok_or_else(|| format!("Gig {gig_id} is no longer open.")),
        Err(error) if allow_mock_hub_fallback() => mock_gigs()
            .into_iter()
            .find(|gig| gig.gig_id == gig_id)
            .ok_or_else(|| format!("Gig {gig_id} not found. Hub error: {error}")),
        Err(error) => Err(format!("Failed to load gig {gig_id}: {error}")),
    }
}

fn contract_exists_for_gig(state: &AppState, gig_id: u64) -> bool {
    state
        .gig_contracts
        .iter()
        .any(|contract| contract.gig_id == gig_id && contract.status != "completed")
}

fn find_contract_mut<'a>(
    state: &'a mut AppState,
    contract_id: &str,
) -> Result<&'a mut GigContract, String> {
    state
        .gig_contracts
        .iter_mut()
        .find(|contract| contract.contract_id == contract_id)
        .ok_or_else(|| format!("Contract {contract_id} not found."))
}

#[tauri::command]
pub async fn list_gig_contracts(
    app_state: State<'_, Mutex<AppState>>,
) -> Result<Vec<GigContract>, String> {
    let state = app_state.lock().map_err(|e| e.to_string())?;
    Ok(state.gig_contracts.clone())
}

#[tauri::command]
pub async fn accept_hub_gig(
    request: AcceptHubGigRequest,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GigContract, String> {
    let (client, pure_local, base_url, api_key) = {
        let state = app_state.lock().map_err(|e| e.to_string())?;
        if contract_exists_for_gig(&state, request.gig_id) {
            return Err("You already have an active contract for this gig.".to_string());
        }
        let pure_local = state.settings.pure_local_mode;
        let client = if pure_local {
            None
        } else {
            Some(client_from_state(&state))
        };
        (
            client,
            pure_local,
            state.hub.base_url.clone(),
            state.hub.api_key.clone(),
        )
    };

    let gig = resolve_gig_for_accept(pure_local, base_url, api_key, request.gig_id).await?;

    if !pure_local {
        if let Some(client) = client {
            match client.assign_gig(request.gig_id).await {
                Ok(_) => {}
                Err(error) if allow_mock_hub_fallback() => {
                    eprintln!("assign_gig fallback: {error}");
                }
                Err(error) => return Err(format!("Failed to accept gig: {error}")),
            }
        }
    }

    let contract = {
        let mut state = app_state.lock().map_err(|e| e.to_string())?;
        let contract = GigContract {
            contract_id: Uuid::new_v4().to_string(),
            gig_id: gig.gig_id,
            title: gig.title,
            description: gig.description,
            budget_usdt: gig.budget_usdt,
            required_skills: gig.required_skills,
            status: "accepted".to_string(),
            progress: 0.0,
            payout_usdt: 0.0,
            platform_fee_usdt: 0.0,
            accepted_at: Utc::now().to_rfc3339(),
            started_at: None,
            completed_at: None,
        };
        state.gig_contracts.push(contract.clone());
        commit(app, &state)?;
        contract
    };

    Ok(contract)
}

#[tauri::command]
pub async fn start_gig_work(
    request: GigLifecycleRequest,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GigContract, String> {
    let (client, gig_id, pure_local) = {
        let state = app_state.lock().map_err(|e| e.to_string())?;
        let contract = state
            .gig_contracts
            .iter()
            .find(|contract| contract.contract_id == request.contract_id)
            .ok_or_else(|| format!("Contract {} not found.", request.contract_id))?;
        if contract.status != "accepted" {
            return Err("Only accepted contracts can be started.".to_string());
        }
        let gig_id = contract.gig_id;
        let pure_local = state.settings.pure_local_mode;
        let client = if pure_local {
            None
        } else {
            Some(client_from_state(&state))
        };
        (client, gig_id, pure_local)
    };

    if !pure_local {
        if let Some(client) = client {
            match client.start_gig(gig_id).await {
                Ok(_) => {}
                Err(error) if allow_mock_hub_fallback() => {
                    eprintln!("start_gig fallback: {error}");
                }
                Err(error) => return Err(format!("Failed to start gig: {error}")),
            }
        }
    }

    let contract = {
        let mut state = app_state.lock().map_err(|e| e.to_string())?;
        let contract = find_contract_mut(&mut state, &request.contract_id)?;
        contract.status = "in_progress".to_string();
        contract.started_at = Some(Utc::now().to_rfc3339());
        let snapshot = contract.clone();
        commit(app, &state)?;
        snapshot
    };

    Ok(contract)
}

#[tauri::command]
pub async fn complete_hub_gig(
    request: GigLifecycleRequest,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GigContract, String> {
    let (client, gig_id, pure_local, tier) = {
        let state = app_state.lock().map_err(|e| e.to_string())?;
        let contract = state
            .gig_contracts
            .iter()
            .find(|contract| contract.contract_id == request.contract_id)
            .ok_or_else(|| format!("Contract {} not found.", request.contract_id))?;
        if contract.status != "in_progress" {
            return Err("Only in-progress contracts can be completed.".to_string());
        }
        if contract.progress < 0.95 {
            return Err(format!(
                "Work is only {:.0}% complete. Keep agents working or wait for simulation ticks.",
                contract.progress * 100.0
            ));
        }
        let gig_id = contract.gig_id;
        let pure_local = state.settings.pure_local_mode;
        let tier = state.hub.user_tier.clone();
        let client = if pure_local {
            None
        } else {
            Some(client_from_state(&state))
        };
        (client, gig_id, pure_local, tier)
    };

    let hub_payout = if !pure_local {
        if let Some(client) = client {
            match client.complete_gig(gig_id).await {
                Ok(body) => body
                    .get("payout_usdt")
                    .and_then(|value| value.as_f64()),
                Err(error) if allow_mock_hub_fallback() => {
                    eprintln!("complete_gig fallback: {error}");
                    None
                }
                Err(error) => return Err(format!("Failed to complete gig on hub: {error}")),
            }
        } else {
            None
        }
    } else {
        None
    };

    let contract = {
        let mut state = app_state.lock().map_err(|e| e.to_string())?;
        let index = state
            .gig_contracts
            .iter()
            .position(|contract| contract.contract_id == request.contract_id)
            .ok_or_else(|| format!("Contract {} not found.", request.contract_id))?;
        if let Some(payout) = hub_payout {
            state.gig_contracts[index].payout_usdt = payout;
            state.gig_contracts[index].platform_fee_usdt =
                (state.gig_contracts[index].budget_usdt - payout).max(0.0);
        } else {
            let budget = state.gig_contracts[index].budget_usdt;
            let (payout, fee) = payout_for_budget(&tier, budget);
            state.gig_contracts[index].payout_usdt = payout;
            state.gig_contracts[index].platform_fee_usdt = fee;
        }
        finalize_contract_at_index(&mut state, index);
        let snapshot = state.gig_contracts[index].clone();
        commit(app, &state)?;
        snapshot
    };

    Ok(contract)
}