use crate::db::persistence::commit;
use crate::gigs::{
    compute_qc_score, finalize_contract_at_index, payout_for_budget, submit_contract_for_qc_at_index,
};
use crate::hub::{filter_gigs_for_tier, HubClient, HubGig};
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GigQcNotesRequest {
    pub contract_id: String,
    #[serde(default)]
    pub qc_notes: Option<String>,
}

fn client_from_state(state: &AppState) -> HubClient {
    HubClient::new(state.hub.base_url.clone(), state.hub.api_key.clone())
}

async fn resolve_gig_for_accept(
    pure_local: bool,
    base_url: String,
    api_key: Option<String>,
    tier: &str,
    gig_id: u64,
    cached_gigs: Vec<HubGig>,
) -> Result<HubGig, String> {
    if pure_local {
        return filter_gigs_for_tier(cached_gigs, tier)
            .into_iter()
            .find(|gig| gig.gig_id == gig_id)
            .ok_or_else(|| {
                format!(
                    "Gig {gig_id} not found. Sync with the hub when online to refresh marketplace listings."
                )
            });
    }

    let client = HubClient::new(base_url, api_key);
    match client.list_open_gigs().await {
        Ok(gigs) => filter_gigs_for_tier(gigs, tier)
            .into_iter()
            .find(|gig| gig.gig_id == gig_id)
            .ok_or_else(|| format!("Gig {gig_id} is no longer open.")),
        Err(error) => {
            filter_gigs_for_tier(cached_gigs, tier)
                .into_iter()
                .find(|gig| gig.gig_id == gig_id)
                .ok_or_else(|| format!("Failed to load gig {gig_id}: {error}"))
        }
    }
}

fn contract_exists_for_gig(state: &AppState, gig_id: u64) -> bool {
    state
        .gig_contracts
        .iter()
        .any(|contract| contract.gig_id == gig_id && contract.status != "completed")
}

fn contract_index_with_status(
    state: &AppState,
    contract_id: &str,
    expected_status: &str,
) -> Result<usize, String> {
    let index = state
        .gig_contracts
        .iter()
        .position(|contract| contract.contract_id == contract_id)
        .ok_or_else(|| format!("Contract {contract_id} not found."))?;
    let status = state.gig_contracts[index].status.clone();
    if status != expected_status {
        return Err(format!(
            "Contract status changed to {status}. Refresh and try again."
        ));
    }
    Ok(index)
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
    let (client, pure_local, base_url, api_key, tier, cached_gigs) = {
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
            state.hub.user_tier.clone(),
            state.hub.cached_open_gigs.clone(),
        )
    };

    let gig = resolve_gig_for_accept(
        pure_local,
        base_url,
        api_key,
        &tier,
        request.gig_id,
        cached_gigs,
    )
    .await?;

    if !pure_local {
        if let Some(client) = client {
            client
                .assign_gig(request.gig_id)
                .await
                .map_err(|error| format!("Failed to accept gig: {error}"))?;
        }
    }

    let contract = {
        let mut state = app_state.lock().map_err(|e| e.to_string())?;
        if contract_exists_for_gig(&state, request.gig_id) {
            return Err("You already have an active contract for this gig.".to_string());
        }
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
            submitted_at: None,
            completed_at: None,
            qc_score: None,
            qc_notes: None,
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
                Err(error) => return Err(format!("Failed to start gig: {error}")),
            }
        }
    }

    let contract = {
        let mut state = app_state.lock().map_err(|e| e.to_string())?;
        let index = contract_index_with_status(&state, &request.contract_id, "accepted")?;
        state.gig_contracts[index].status = "in_progress".to_string();
        state.gig_contracts[index].started_at = Some(Utc::now().to_rfc3339());
        let snapshot = state.gig_contracts[index].clone();
        commit(app, &state)?;
        snapshot
    };

    Ok(contract)
}

#[tauri::command]
pub async fn submit_gig_for_qc(
    request: GigLifecycleRequest,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GigContract, String> {
    let (client, gig_id, pure_local, qc_score) = {
        let state = app_state.lock().map_err(|e| e.to_string())?;
        let contract = state
            .gig_contracts
            .iter()
            .find(|contract| contract.contract_id == request.contract_id)
            .ok_or_else(|| format!("Contract {} not found.", request.contract_id))?;
        if contract.status != "in_progress" {
            return Err("Only in-progress contracts can be submitted for QC.".to_string());
        }
        if contract.progress < 0.95 {
            return Err(format!(
                "Work is only {:.0}% complete. Keep agents working or wait for simulation ticks.",
                contract.progress * 100.0
            ));
        }
        let gig_id = contract.gig_id;
        let pure_local = state.settings.pure_local_mode;
        let qc_score = compute_qc_score(&state, contract);
        let client = if pure_local {
            None
        } else {
            Some(client_from_state(&state))
        };
        (client, gig_id, pure_local, qc_score)
    };

    if !pure_local {
        if let Some(client) = client {
            match client
                .submit_gig_for_qc(gig_id, qc_score)
                .await
            {
                Ok(_) => {}
                Err(error) => return Err(format!("Failed to submit gig for QC: {error}")),
            }
        }
    }

    let contract = {
        let mut state = app_state.lock().map_err(|e| e.to_string())?;
        let index = contract_index_with_status(&state, &request.contract_id, "in_progress")?;
        if state.gig_contracts[index].progress < 0.95 {
            return Err(format!(
                "Work is only {:.0}% complete. Keep agents working or wait for simulation ticks.",
                state.gig_contracts[index].progress * 100.0
            ));
        }
        submit_contract_for_qc_at_index(&mut state, index);
        let snapshot = state.gig_contracts[index].clone();
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
        if contract.status != "in_qc" {
            return Err("Only contracts in QC review can be approved for payout.".to_string());
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
        let index = contract_index_with_status(&state, &request.contract_id, "in_qc")?;
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

#[tauri::command]
pub async fn reject_gig_qc(
    request: GigQcNotesRequest,
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
        if contract.status != "in_qc" {
            return Err("Only contracts in QC review can be rejected.".to_string());
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
            match client
                .reject_gig_qc(gig_id, request.qc_notes.clone())
                .await
            {
                Ok(_) => {}
                Err(error) => return Err(format!("Failed to reject gig QC: {error}")),
            }
        }
    }

    let contract = {
        let mut state = app_state.lock().map_err(|e| e.to_string())?;
        let index = contract_index_with_status(&state, &request.contract_id, "in_qc")?;
        state.gig_contracts[index].status = "in_progress".to_string();
        state.gig_contracts[index].progress = (state.gig_contracts[index].progress - 0.2).max(0.6);
        state.gig_contracts[index].qc_notes = Some(
            request
                .qc_notes
                .filter(|note| !note.trim().is_empty())
                .unwrap_or_else(|| "Revision requested — improve deliverable quality.".to_string()),
        );
        state.gig_contracts[index].qc_score = None;
        state.gig_contracts[index].submitted_at = None;
        let snapshot = state.gig_contracts[index].clone();
        commit(app, &state)?;
        snapshot
    };

    Ok(contract)
}

#[tauri::command]
pub async fn dispute_hub_gig(
    request: GigQcNotesRequest,
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
        if contract.status != "in_qc" && contract.status != "in_progress" {
            return Err("Only active contracts can be disputed.".to_string());
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
            match client
                .dispute_gig(gig_id, request.qc_notes.clone())
                .await
            {
                Ok(_) => {}
                Err(error) => return Err(format!("Failed to open gig dispute: {error}")),
            }
        }
    }

    let contract = {
        let mut state = app_state.lock().map_err(|e| e.to_string())?;
        let index = state
            .gig_contracts
            .iter()
            .position(|contract| contract.contract_id == request.contract_id)
            .ok_or_else(|| format!("Contract {} not found.", request.contract_id))?;
        let status = state.gig_contracts[index].status.clone();
        if status != "in_qc" && status != "in_progress" {
            return Err(format!(
                "Contract status changed to {status}. Refresh and try again."
            ));
        }
        state.gig_contracts[index].status = "disputed".to_string();
        state.gig_contracts[index].qc_notes = Some(
            request
                .qc_notes
                .filter(|note| !note.trim().is_empty())
                .unwrap_or_else(|| "Dispute opened — awaiting platform mediation.".to_string()),
        );
        let snapshot = state.gig_contracts[index].clone();
        commit(app, &state)?;
        snapshot
    };

    Ok(contract)
}