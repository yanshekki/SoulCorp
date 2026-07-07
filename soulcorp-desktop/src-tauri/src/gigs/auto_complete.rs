use crate::gigs::hub_sync::{blocking_complete_gig, enqueue_gig_complete, hub_client_from_state};
use crate::gigs::{finalize_contract_at_index, payout_for_budget};
use crate::state::AppState;

pub struct AutoCompleteReport {
    pub completed: u32,
    pub messages: Vec<String>,
}

pub fn try_auto_complete_gigs(state: &mut AppState) -> AutoCompleteReport {
    let mut report = AutoCompleteReport {
        completed: 0,
        messages: Vec::new(),
    };

    if !state.settings.orchestrator_auto_complete_gigs || state.company_id.is_empty() {
        return report;
    }

    let indices: Vec<usize> = state
        .gig_contracts
        .iter()
        .enumerate()
        .filter(|(_, contract)| contract.status == "in_qc")
        .map(|(index, _)| index)
        .collect();

    for index in indices {
        let (gig_id, contract_id, title, budget, pure_local, tier) = {
            let contract = &state.gig_contracts[index];
            (
                contract.gig_id,
                contract.contract_id.clone(),
                contract.title.clone(),
                contract.budget_usdt,
                state.settings.pure_local_mode,
                state.hub.user_tier.clone(),
            )
        };

        let hub_payout = if !pure_local && !state.hub.base_url.trim().is_empty() {
            let client = hub_client_from_state(state);
            match blocking_complete_gig(&client, gig_id) {
                Ok(body) => body
                    .get("payout_usdt")
                    .and_then(|value| value.as_f64()),
                Err(err) => {
                    enqueue_gig_complete(state, gig_id, &contract_id);
                    report.messages.push(format!(
                        "Hub complete queued for gig {gig_id}: {err}"
                    ));
                    None
                }
            }
        } else {
            None
        };

        let contract = state
            .gig_contracts
            .get_mut(index)
            .expect("contract index remains valid");
        if contract.status != "in_qc" {
            continue;
        }

        if let Some(payout) = hub_payout {
            contract.payout_usdt = payout;
            contract.platform_fee_usdt = (budget - payout).max(0.0);
        } else if contract.payout_usdt <= 0.0 {
            let (payout, fee) = payout_for_budget(&tier, budget);
            contract.payout_usdt = payout;
            contract.platform_fee_usdt = fee;
        }

        finalize_contract_at_index(state, index);
        report.completed += 1;
        report.messages.push(format!(
            "Auto-completed marketplace gig: {title} ({contract_id})"
        ));
    }

    report
}