use crate::state::{AppState, GigContract};
use crate::tier::benefits_for_tier;

pub struct GigTickResult {
    pub contracts_advanced: u32,
    pub contracts_submitted_for_qc: u32,
}

pub fn compute_qc_score(state: &AppState, contract: &GigContract) -> f32 {
    let skill_match = contract
        .required_skills
        .iter()
        .filter(|skill| {
            let needle = skill.to_lowercase();
            state.agents.values().any(|agent| {
                agent.role.to_lowercase().contains(&needle)
                    || agent.department.to_lowercase().contains(&needle)
                    || agent
                        .soul
                        .as_ref()
                        .map(|soul| {
                            soul.name.to_lowercase().contains(&needle)
                                || soul.raw_content.to_lowercase().contains(&needle)
                        })
                        .unwrap_or(false)
            })
        })
        .count() as f32;
    let skill_factor = if contract.required_skills.is_empty() {
        0.75
    } else {
        (skill_match / contract.required_skills.len() as f32).min(1.0)
    };

    let morale_avg = if state.agents.is_empty() {
        0.7
    } else {
        state
            .agents
            .values()
            .map(|agent| agent.morale)
            .sum::<f32>()
            / state.agents.len() as f32
    };

    let progress_factor = contract.progress.clamp(0.0, 1.0);
    let score = (progress_factor * 0.45 + skill_factor * 0.35 + morale_avg * 0.2).clamp(0.55, 0.99);
    (score * 100.0).round() / 100.0
}

pub fn payout_for_budget(tier: &str, budget_usdt: f64) -> (f64, f64) {
    let fee_pct = benefits_for_tier(tier).platform_fee_percent as f64;
    let fee = (budget_usdt * fee_pct / 100.0 * 100.0).round() / 100.0;
    let payout = (budget_usdt - fee).max(0.0);
    (payout, fee)
}

pub fn apply_gig_contract_ticks(state: &mut AppState) -> GigTickResult {
    let mut contracts_advanced = 0;
    let mut qc_indices = Vec::new();

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
            qc_indices.push(index);
        }
    }

    let contracts_submitted_for_qc = qc_indices.len() as u32;
    for index in qc_indices {
        submit_contract_for_qc_at_index(state, index);
    }

    GigTickResult {
        contracts_advanced,
        contracts_submitted_for_qc,
    }
}

pub fn submit_contract_for_qc_at_index(state: &mut AppState, index: usize) {
    let snapshot = state.gig_contracts.get(index).cloned();
    let Some(snapshot) = snapshot else {
        return;
    };
    if snapshot.status != "in_progress" {
        return;
    }

    let qc_score = compute_qc_score(state, &snapshot);
    let Some(contract) = state.gig_contracts.get_mut(index) else {
        return;
    };
    contract.qc_score = Some(qc_score);
    contract.status = "in_qc".to_string();
    contract.submitted_at = Some(chrono::Utc::now().to_rfc3339());
    contract.qc_notes = None;
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

    #[test]
    fn gig_lifecycle_transitions_to_completed() {
        let mut state = AppState::default();
        state.hub.user_tier = "free".to_string();
        let mut contract = GigContract {
            contract_id: "c1".into(),
            gig_id: 1,
            title: "Test gig".into(),
            description: "Desc".into(),
            budget_usdt: 100.0,
            required_skills: vec!["rust".into()],
            status: "in_qc".into(),
            progress: 1.0,
            qc_score: Some(0.85),
            qc_notes: None,
            payout_usdt: 0.0,
            platform_fee_usdt: 0.0,
            accepted_at: "2026-01-01T00:00:00Z".into(),
            started_at: None,
            submitted_at: None,
            completed_at: None,
        };
        finalize_contract_payout(&mut state, &mut contract);
        assert_eq!(contract.status, "completed");
        assert_eq!(state.stats.gigs_completed, 1);
        assert!(state.finance.cash_balance > 0.0);
    }
}