use crate::gigs::hub_sync::{blocking_assign_gig, blocking_start_gig, enqueue_gig_assign, hub_client_from_state};
use crate::hub::{filter_gigs_for_tier, HubGig};
use crate::scrum::issue_marketplace_directive;
use crate::state::{AppState, GigContract};
use chrono::Utc;
use uuid::Uuid;

pub struct AutoAcceptReport {
    pub accepted: u32,
    pub messages: Vec<String>,
}

pub fn try_auto_accept_hub_gigs(state: &mut AppState) -> AutoAcceptReport {
    let mut report = AutoAcceptReport {
        accepted: 0,
        messages: Vec::new(),
    };

    if !state.settings.orchestrator_auto_accept_gigs || state.company_id.is_empty() {
        return report;
    }

    let max_active = state.settings.orchestrator_max_active_gigs.max(1);
    let active = state
        .gig_contracts
        .iter()
        .filter(|c| c.status != "completed")
        .count() as u32;

    if active >= max_active {
        return report;
    }

    let slots = max_active.saturating_sub(active);
    let tier = state.hub.user_tier.clone();
    let gigs: Vec<HubGig> = filter_gigs_for_tier(state.hub.cached_open_gigs.clone(), &tier);

    let mut candidates: Vec<HubGig> = gigs
        .into_iter()
        .filter(|gig| gig.status == "open" || gig.status.is_empty())
        .filter(|gig| !contract_exists_for_gig(state, gig.gig_id))
        .collect();

    candidates.sort_by(|a, b| {
        b.budget_usdt
            .partial_cmp(&a.budget_usdt)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    for gig in candidates.into_iter().take(slots as usize) {
        match accept_gig_into_state(state, &gig) {
            Ok(contract_id) => {
                report.accepted += 1;
                report.messages.push(format!(
                    "Auto-accepted marketplace gig: {} ({contract_id})",
                    gig.title
                ));
            }
            Err(err) => report.messages.push(format!("Auto-accept failed for {}: {err}", gig.title)),
        }
    }

    report
}

fn contract_exists_for_gig(state: &AppState, gig_id: u64) -> bool {
    state
        .gig_contracts
        .iter()
        .any(|contract| contract.gig_id == gig_id && contract.status != "completed")
}

fn accept_gig_into_state(state: &mut AppState, gig: &HubGig) -> Result<String, String> {
    if contract_exists_for_gig(state, gig.gig_id) {
        return Err("Contract already exists.".into());
    }

    if !state.settings.pure_local_mode && !state.hub.base_url.trim().is_empty() {
        let client = hub_client_from_state(state);
        match blocking_assign_gig(&client, gig.gig_id) {
            Ok(_) => {}
            Err(err) => {
                enqueue_gig_assign(state, gig.gig_id);
                crate::app_log::log_global(crate::app_log::LogLevel::Warn, crate::app_log::LogCategory::Hub, "auto_accept", format!("Hub assign queued for gig {}: {err}", gig.gig_id), None);
            }
        }
    }

    let contract = GigContract {
        contract_id: format!("contract-{}", Uuid::new_v4()),
        gig_id: gig.gig_id,
        title: gig.title.clone(),
        description: gig.description.clone(),
        budget_usdt: gig.budget_usdt,
        required_skills: gig.required_skills.clone(),
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

    let contract_id = contract.contract_id.clone();
    state.gig_contracts.push(contract.clone());
    issue_marketplace_directive(
        state,
        &contract_id,
        &contract.title,
        &contract.description,
    );

    if state.settings.orchestrator_auto_start_gigs {
        start_accepted_contract(state, &contract_id, gig.gig_id)?;
    }

    Ok(contract_id)
}

fn start_accepted_contract(
    state: &mut AppState,
    contract_id: &str,
    gig_id: u64,
) -> Result<(), String> {
    let index = state
        .gig_contracts
        .iter()
        .position(|c| c.contract_id == contract_id)
        .ok_or_else(|| "Contract not found.".to_string())?;
    if state.gig_contracts[index].status != "accepted" {
        return Ok(());
    }

    if !state.settings.pure_local_mode && !state.hub.base_url.trim().is_empty() {
        let client = hub_client_from_state(state);
        if let Err(err) = blocking_start_gig(&client, gig_id) {
            crate::gigs::hub_sync::enqueue_gig_start(state, gig_id);
            crate::app_log::log_global(crate::app_log::LogLevel::Warn, crate::app_log::LogCategory::Hub, "auto_accept", format!("Hub start queued for gig {gig_id}: {err}"), None);
        }
    }

    state.gig_contracts[index].status = "in_progress".to_string();
    state.gig_contracts[index].started_at = Some(Utc::now().to_rfc3339());
    Ok(())
}