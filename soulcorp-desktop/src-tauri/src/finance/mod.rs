use crate::state::{AgentRecord, AppState, BudgetAllocations};

const COMPUTE_STARVE_THRESHOLD: f64 = 250.0;
const CASH_CRISIS_THRESHOLD: f64 = 500.0;

pub struct FinanceTickResult {
    pub compute_starved: bool,
    pub cash_crisis: bool,
    pub daily_salary_paid: f64,
    pub compute_spent: f64,
}

pub fn total_monthly_salary(agents: &std::collections::HashMap<String, AgentRecord>) -> f64 {
    agents.values().map(|agent| agent.salary as f64).sum()
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

pub fn apply_tick_finance(state: &mut AppState) -> FinanceTickResult {
    let agent_count = state.agents.len().max(1) as f64;
    let compute_weight = state.finance.allocations.compute_pct as f64 / 100.0;
    let marketing_weight = state.finance.allocations.marketing_pct as f64 / 100.0;

    let base_compute_cost = agent_count * 2.5 * compute_weight.max(0.2);
    let compute_spent = if state.finance.compute_starved {
        base_compute_cost * 0.35
    } else {
        base_compute_cost
    };

    state.finance.compute_tokens = (state.finance.compute_tokens - compute_spent).max(0.0);
    state.finance.cash_balance -= compute_spent * 0.15;

    let mut daily_salary_paid = 0.0;
    if state.tick % 30 == 0 {
        state.day_number += 1;
        daily_salary_paid = total_monthly_salary(&state.agents) / 30.0;
        state.finance.cash_balance -= daily_salary_paid;
        state.finance.cash_balance += state.finance.monthly_revenue / 30.0;
        state.finance.cash_balance += state.finance.monthly_revenue * marketing_weight * 0.05;
        state.finance.monthly_burn = total_monthly_salary(&state.agents) + agent_count * 75.0;
    }

    let compute_starved = state.finance.compute_tokens < COMPUTE_STARVE_THRESHOLD;
    let cash_crisis = state.finance.cash_balance < CASH_CRISIS_THRESHOLD;
    state.finance.compute_starved = compute_starved;
    state.finance.cash_crisis = cash_crisis;

    for agent in state.agents.values_mut() {
        if agent.status == "meeting" {
            continue;
        }

        if compute_starved {
            agent.status = "throttled".to_string();
            agent.energy = (agent.energy - 0.02).max(0.15);
            agent.morale = (agent.morale - 0.015).max(0.0);
        } else if agent.status == "throttled" {
            agent.status = "working".to_string();
        }

        if cash_crisis {
            agent.morale = (agent.morale - 0.01).max(0.0);
        }

        if agent.status != "meeting" && agent.status != "throttled" {
            agent.energy = (agent.energy - 0.01).max(0.2);
            if agent.energy < 0.35 {
                agent.morale = (agent.morale - 0.02).max(0.0);
            }
        }
    }

    FinanceTickResult {
        compute_starved,
        cash_crisis,
        daily_salary_paid,
        compute_spent,
    }
}

