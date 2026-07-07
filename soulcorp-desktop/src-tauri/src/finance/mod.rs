use crate::fate::is_system_agent;
use crate::state::{AgentRecord, AppState, BudgetAllocations};
use crate::token_budget::{apply_enforcement, charge_tokens, total_company_tokens, ChargeContext};
use crate::ai::provider::TokenUsageSource;

pub struct FinanceTickResult {
    pub company_starved: bool,
    pub daily_salary_paid: u64,
    #[allow(dead_code)]
    pub inflow_tokens: u64,
}

pub fn total_monthly_salary(agents: &std::collections::HashMap<String, AgentRecord>) -> u64 {
    agents
        .values()
        .filter(|agent| !is_system_agent(agent))
        .map(|agent| agent.salary as u64)
        .sum()
}

pub fn projected_monthly_payroll(agents: &std::collections::HashMap<String, AgentRecord>) -> u64 {
    let staffed = agents.values().filter(|agent| !is_system_agent(agent)).count() as u64;
    total_monthly_salary(agents).saturating_add(staffed.saturating_mul(75))
}

pub fn count_active_agents(state: &AppState, include_throttled: bool) -> u32 {
    state
        .agents
        .values()
        .filter(|agent| {
            agent.status == "working"
                || agent.status == "meeting"
                || (include_throttled && agent.status == "throttled")
        })
        .count() as u32
}

pub fn normalize_allocations(allocations: &mut BudgetAllocations) {
    let sum = allocations.compute_pct
        + allocations.salaries_pct
        + allocations.marketing_pct
        + allocations.rnd_pct;
    if sum <= 0.0 {
        *allocations = BudgetAllocations::default();
        return;
    }
    if (sum - 100.0).abs() < 0.01 {
        return;
    }
    allocations.compute_pct = allocations.compute_pct / sum * 100.0;
    allocations.salaries_pct = allocations.salaries_pct / sum * 100.0;
    allocations.marketing_pct = allocations.marketing_pct / sum * 100.0;
    allocations.rnd_pct = allocations.rnd_pct / sum * 100.0;
}

pub struct DailyFinanceResult {
    pub daily_salary_paid: u64,
    pub inflow_tokens: u64,
}

/// Payroll, inflow, and burn snapshot for one simulation day (does not advance tick).
pub fn apply_daily_finance(state: &mut AppState) -> DailyFinanceResult {
    let agent_count = state.agents.len().max(1) as u64;
    let salary_weight = state.token_economy.allocations.salaries_pct as f64 / 100.0;
    let marketing_weight = state.token_economy.allocations.marketing_pct as f64 / 100.0;
    let rnd_weight = state.token_economy.allocations.rnd_pct as f64 / 100.0;

    state.day_number += 1;
    let daily_salary_paid =
        (total_monthly_salary(&state.agents) as f64 / 30.0 * salary_weight.max(0.25)) as u64;
    let rnd_spend = (agent_count as f64 * 75.0 * rnd_weight / 30.0) as u64;
    let payroll_total = daily_salary_paid.saturating_add(rnd_spend);

    if payroll_total > 0 && total_company_tokens(&state.token_economy) >= payroll_total {
        let agent_charges: Vec<(String, String)> = state
            .agents
            .values()
            .filter(|agent| !is_system_agent(agent))
            .map(|agent| (agent.id.clone(), agent.department.clone()))
            .collect();
        let share = payroll_total / agent_charges.len().max(1) as u64;
        for (agent_id, department) in agent_charges {
            if share == 0 {
                continue;
            }
            let _ = charge_tokens(
                state,
                ChargeContext {
                    source: "payroll".into(),
                    agent_id,
                    department,
                    provider: "simulation".into(),
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: share as u32,
                    usage_source: TokenUsageSource::Estimated,
                },
            );
        }
    }

    let inflow_tokens = (state.token_economy.monthly_inflow_tokens as f64 / 30.0) as u64;
    let marketing_bonus =
        (state.token_economy.monthly_inflow_tokens as f64 * marketing_weight * 0.05) as u64;
    state.token_economy.company_balance = state
        .token_economy
        .company_balance
        .saturating_add(inflow_tokens)
        .saturating_add(marketing_bonus);

    state.token_economy.monthly_burn_tokens = (total_monthly_salary(&state.agents) as f64
        * salary_weight.max(0.25)
        + agent_count as f64 * 75.0 * rnd_weight) as u64;

    DailyFinanceResult {
        daily_salary_paid,
        inflow_tokens,
    }
}

pub fn apply_agent_tick_wear(state: &mut AppState) {
    for agent in state.agents.values_mut() {
        if is_system_agent(agent) || agent.status == "meeting" || agent.status == "throttled" {
            continue;
        }
        agent.energy = (agent.energy - 0.01).max(0.2);
        if agent.energy < 0.35 {
            agent.morale = (agent.morale - 0.02).max(0.0);
        }
    }
}

pub fn apply_tick_finance(state: &mut AppState) -> FinanceTickResult {
    let mut daily_salary_paid = 0u64;
    let mut inflow_tokens = 0u64;

    if state.tick.is_multiple_of(30) {
        let daily = apply_daily_finance(state);
        daily_salary_paid = daily.daily_salary_paid;
        inflow_tokens = daily.inflow_tokens;
    }

    apply_enforcement(state);
    apply_agent_tick_wear(state);

    FinanceTickResult {
        company_starved: state.token_economy.company_starved,
        daily_salary_paid,
        inflow_tokens,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{AgentRecord, AppState, BudgetAllocations};
    use std::collections::HashMap;

    fn sample_state() -> AppState {
        let mut agents = HashMap::new();
        agents.insert(
            "agent-1".to_string(),
            AgentRecord {
                id: "agent-1".to_string(),
                name: "Mira".to_string(),
                role: "Engineer".to_string(),
                department: "Engineering".to_string(),
                morale: 0.8,
                energy: 0.8,
                salary: 3000.0,
                status: "working".to_string(),
                soul: None,
                soul_id: None,
                ai_provider: None,
                agent_kind: None,
                skills: crate::state::skills_for_role("Engineer"),
                reports_to: None,
                manages_department: None,
            },
        );
        let mut state = AppState {
            agents,
            token_economy: crate::state::TokenEconomy {
                allocations: BudgetAllocations {
                    compute_pct: 25.0,
                    salaries_pct: 50.0,
                    marketing_pct: 15.0,
                    rnd_pct: 10.0,
                },
                ..crate::state::TokenEconomy::default()
            },
            tick: 29,
            day_number: 0,
            ..AppState::default()
        };
        crate::token_budget::initialize_wallets_from_agents(&mut state);
        state
    }

    #[test]
    fn payroll_runs_on_day_boundary() {
        let mut state = sample_state();
        let before = apply_tick_finance(&mut state);
        assert_eq!(before.daily_salary_paid, 0);
        assert_eq!(state.day_number, 0);

        state.tick = 30;
        let after = apply_tick_finance(&mut state);
        assert!(after.daily_salary_paid > 0 || after.inflow_tokens > 0);
        assert_eq!(state.day_number, 1);
    }

    #[test]
    fn count_active_agents_includes_throttled_when_requested() {
        let mut state = sample_state();
        state.agents.get_mut("agent-1").unwrap().status = "throttled".to_string();
        assert_eq!(count_active_agents(&state, false), 0);
        assert_eq!(count_active_agents(&state, true), 1);
    }
}