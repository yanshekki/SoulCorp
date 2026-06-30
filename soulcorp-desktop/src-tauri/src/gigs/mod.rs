use crate::state::{AppState, GigContract};
use crate::tier::benefits_for_tier;

pub struct GigTickResult {
    pub contracts_advanced: u32,
    pub contracts_completed: u32,
}

pub fn payout_for_budget(tier: &str, budget_usdt: f64) -> (f64, f64) {
    let fee_pct = benefits_for_tier(tier).platform_fee_percent as f64;
    let fee = (budget_usdt * fee_pct / 100.0 * 100.0).round() / 100.0;
    let payout = (budget_usdt - fee).max(0.0);
    (payout, fee)
}

pub fn apply_gig_contract_ticks(state: &mut AppState) -> GigTickResult {
    let mut contracts_advanced = 0;
    let mut completed_indices = Vec::new();

    let working_agents = state
        .agents
        .values()
        .filter(|agent| {
            agent.status == "working"
                || agent.status == "meeting"
                || agent.status == "throttled"
        })
        .count()
        .max(1) as f32;

    let progress_per_tick = (0.04 + working_agents * 0.01).min(0.15);

    for (index, contract) in state.gig_contracts.iter_mut().enumerate() {
        if contract.status != "in_progress" {
            continue;
        }

        let previous = contract.progress;
        contract.progress = (contract.progress + progress_per_tick).min(1.0);
        if contract.progress > previous {
            contracts_advanced += 1;
        }

        if contract.progress >= 1.0 {
            completed_indices.push(index);
        }
    }

    let contracts_completed = completed_indices.len() as u32;
    for index in completed_indices {
        finalize_contract_at_index(state, index);
    }

    GigTickResult {
        contracts_advanced,
        contracts_completed,
    }
}

pub fn finalize_contract_at_index(state: &mut AppState, index: usize) {
    let tier = state.hub.user_tier.clone();
    let Some(contract) = state.gig_contracts.get_mut(index) else {
        return;
    };
    if contract.status == "completed" {
        return;
    }

    if contract.payout_usdt <= 0.0 {
        let (payout, fee) = payout_for_budget(&tier, contract.budget_usdt);
        contract.payout_usdt = payout;
        contract.platform_fee_usdt = fee;
    }

    let payout = contract.payout_usdt;
    contract.status = "completed".to_string();
    contract.progress = 1.0;
    contract.completed_at = Some(chrono::Utc::now().to_rfc3339());

    state.finance.cash_balance += payout;
    state.finance.monthly_revenue += payout;
    state.stats.gigs_completed += 1;
}

pub fn finalize_contract_payout(state: &mut AppState, contract: &mut GigContract) {
    if contract.status == "completed" {
        return;
    }

    if contract.payout_usdt <= 0.0 {
        let (payout, fee) = payout_for_budget(&state.hub.user_tier, contract.budget_usdt);
        contract.payout_usdt = payout;
        contract.platform_fee_usdt = fee;
    }

    let payout = contract.payout_usdt;
    contract.status = "completed".to_string();
    contract.progress = 1.0;
    contract.completed_at = Some(chrono::Utc::now().to_rfc3339());

    state.finance.cash_balance += payout;
    state.finance.monthly_revenue += payout;
    state.stats.gigs_completed += 1;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payout_applies_tier_fee() {
        let (payout, fee) = payout_for_budget("free", 100.0);
        assert_eq!(payout, 90.0);
        assert_eq!(fee, 10.0);

        let (vip_payout, vip_fee) = payout_for_budget("vip", 200.0);
        assert_eq!(vip_payout, 190.0);
        assert_eq!(vip_fee, 10.0);
    }
}