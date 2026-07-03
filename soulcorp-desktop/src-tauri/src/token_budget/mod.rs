use crate::ai::provider::TokenUsageSource;
use crate::state::{
    AgentRecord, AgentTokenWallet, AppState, DepartmentTokenWallet, TokenEconomy, TokenUsageEntry,
};
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug)]
struct PeriodWalletFields<'a> {
    period_limit: &'a mut u64,
    period_type: &'a mut String,
    period_days: &'a mut u32,
    period_spent: &'a mut u64,
    period_started_at: &'a mut Option<String>,
}

fn period_duration_days(period_type: &str, custom_days: u32) -> Option<u32> {
    match period_type {
        "weekly" => Some(7),
        "monthly" => Some(30),
        "quarterly" => Some(90),
        "yearly" => Some(365),
        "custom" => Some(custom_days.max(1)),
        _ => None,
    }
}

fn maybe_reset_period(fields: &mut PeriodWalletFields<'_>) {
    if *fields.period_limit == 0 || fields.period_type == "none" {
        return;
    }
    let Some(duration_days) = period_duration_days(fields.period_type, *fields.period_days) else {
        return;
    };
    let now = Utc::now();
    let should_reset = match fields.period_started_at.as_ref() {
        None => {
            *fields.period_started_at = Some(now.to_rfc3339());
            false
        }
        Some(started_at) => DateTime::parse_from_rfc3339(started_at)
            .map(|started| {
                let elapsed = now.signed_duration_since(started.with_timezone(&Utc));
                elapsed.num_days() >= duration_days as i64
            })
            .unwrap_or(true),
    };
    if should_reset {
        *fields.period_spent = 0;
        *fields.period_started_at = Some(now.to_rfc3339());
    }
}

fn period_fields_from_department(wallet: &mut DepartmentTokenWallet) -> PeriodWalletFields<'_> {
    PeriodWalletFields {
        period_limit: &mut wallet.period_limit,
        period_type: &mut wallet.period_type,
        period_days: &mut wallet.period_days,
        period_spent: &mut wallet.period_spent,
        period_started_at: &mut wallet.period_started_at,
    }
}

fn period_fields_from_agent(wallet: &mut AgentTokenWallet) -> PeriodWalletFields<'_> {
    PeriodWalletFields {
        period_limit: &mut wallet.period_limit,
        period_type: &mut wallet.period_type,
        period_days: &mut wallet.period_days,
        period_spent: &mut wallet.period_spent,
        period_started_at: &mut wallet.period_started_at,
    }
}

pub fn reset_token_budget_periods(state: &mut AppState) {
    for wallet in state.token_economy.departments.values_mut() {
        maybe_reset_period(&mut period_fields_from_department(wallet));
    }
    for wallet in state.token_economy.agents.values_mut() {
        maybe_reset_period(&mut period_fields_from_agent(wallet));
    }
}

fn period_limit_blocks(cost: u64, limit: u64, spent: u64, label: &str) -> Result<(), String> {
    if limit == 0 {
        return Ok(());
    }
    if spent.saturating_add(cost) > limit {
        return Err(format!(
            "{label} period limit reached ({spent}/{limit} tokens used this period)."
        ));
    }
    Ok(())
}

pub const LEDGER_CAP: usize = 200;

fn usage_source_label(source: TokenUsageSource) -> String {
    match source {
        TokenUsageSource::Api => "api".to_string(),
        TokenUsageSource::Estimated => "estimated".to_string(),
        TokenUsageSource::Zero => "zero".to_string(),
    }
}

#[derive(Debug, Clone)]
pub struct ChargeContext {
    pub source: String,
    pub agent_id: String,
    pub department: String,
    pub provider: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub usage_source: TokenUsageSource,
}

pub fn total_company_tokens(economy: &TokenEconomy) -> u64 {
    economy
        .company_balance
        .saturating_add(
            economy
                .departments
                .values()
                .map(|wallet| wallet.balance)
                .sum::<u64>(),
        )
        .saturating_add(
            economy
                .agents
                .values()
                .map(|wallet| wallet.balance)
                .sum::<u64>(),
        )
}

pub fn ensure_department_wallet(economy: &mut TokenEconomy, department: &str) {
    economy
        .departments
        .entry(department.to_string())
        .or_insert_with(DepartmentTokenWallet::default);
}

pub fn ensure_agent_wallet(economy: &mut TokenEconomy, agent: &AgentRecord) {
    ensure_department_wallet(economy, &agent.department);
    economy
        .agents
        .entry(agent.id.clone())
        .or_insert_with(AgentTokenWallet::default);
}

pub fn initialize_wallets_from_agents(state: &mut AppState) {
    let total = if state.token_economy.company_balance > 0
        || !state.token_economy.departments.is_empty()
    {
        total_company_tokens(&state.token_economy)
    } else {
        15_000
    };
    state.token_economy.company_balance = total;
    state.token_economy.departments.clear();
    state.token_economy.agents.clear();
    rebalance_token_wallets(state);
}

pub fn rebalance_token_wallets(state: &mut AppState) {
    let agents: Vec<AgentRecord> = state.agents.values().cloned().collect();
    if agents.is_empty() {
        return;
    }

    let total = total_company_tokens(&state.token_economy).max(1);
    let previous_departments = state.token_economy.departments.clone();
    let previous_agents = state.token_economy.agents.clone();
    let mut dept_weights: HashMap<String, f32> = HashMap::new();
    for agent in &agents {
        *dept_weights.entry(agent.department.clone()).or_insert(0.0) += 1.0;
    }
    let dept_count = dept_weights.len().max(1) as f32;

    state.token_economy.departments.clear();
    state.token_economy.agents.clear();
    state.token_economy.company_balance = 0;

    let dept_share_base = total / dept_count as u64;
    let mut assigned = 0u64;

    let mut departments: Vec<String> = dept_weights.keys().cloned().collect();
    departments.sort();

    for (index, department) in departments.iter().enumerate() {
        let dept_agents: Vec<&AgentRecord> = agents
            .iter()
            .filter(|agent| &agent.department == department)
            .collect();
        let dept_total = if index + 1 == departments.len() {
            total.saturating_sub(assigned)
        } else {
            dept_share_base
        };
        assigned = assigned.saturating_add(dept_total);

        let agent_share = dept_total / dept_agents.len().max(1) as u64;
        let previous_dept = previous_departments.get(department);
        let mut dept_wallet = DepartmentTokenWallet {
            balance: 0,
            allocated: dept_total,
            spent: previous_dept.map(|wallet| wallet.spent).unwrap_or(0),
            period_limit: previous_dept.map(|wallet| wallet.period_limit).unwrap_or(0),
            period_type: previous_dept
                .map(|wallet| wallet.period_type.clone())
                .unwrap_or_else(|| "none".to_string()),
            period_days: previous_dept.map(|wallet| wallet.period_days).unwrap_or(30),
            period_spent: previous_dept.map(|wallet| wallet.period_spent).unwrap_or(0),
            period_started_at: previous_dept
                .and_then(|wallet| wallet.period_started_at.clone()),
        };

        for (agent_index, agent) in dept_agents.iter().enumerate() {
            let agent_amount = if agent_index + 1 == dept_agents.len() {
                dept_total.saturating_sub(agent_share.saturating_mul(agent_index as u64))
            } else {
                agent_share
            };
            let previous_agent = previous_agents.get(&agent.id);
            state.token_economy.agents.insert(
                agent.id.clone(),
                AgentTokenWallet {
                    balance: agent_amount,
                    allocated: agent_amount,
                    spent: previous_agent.map(|wallet| wallet.spent).unwrap_or(0),
                    period_limit: previous_agent.map(|wallet| wallet.period_limit).unwrap_or(0),
                    period_type: previous_agent
                        .map(|wallet| wallet.period_type.clone())
                        .unwrap_or_else(|| "none".to_string()),
                    period_days: previous_agent.map(|wallet| wallet.period_days).unwrap_or(30),
                    period_spent: previous_agent.map(|wallet| wallet.period_spent).unwrap_or(0),
                    period_started_at: previous_agent
                        .and_then(|wallet| wallet.period_started_at.clone()),
                },
            );
            dept_wallet.balance = dept_wallet.balance.saturating_add(agent_amount);
        }

        state
            .token_economy
            .departments
            .insert(department.clone(), dept_wallet);
    }
}

pub fn can_afford(state: &AppState, agent_id: &str, cost: u32) -> Result<(), String> {
    if cost == 0 {
        return Ok(());
    }
    let cost = cost as u64;
    let economy = &state.token_economy;
    if economy.company_starved && total_company_tokens(economy) < cost {
        return Err("Company token balance is depleted. Allocate tokens in the Tokens panel.".to_string());
    }

    let agent = state
        .agents
        .get(agent_id)
        .ok_or_else(|| format!("Agent '{agent_id}' not found."))?;
    let department = agent.department.clone();

    if let Some(wallet) = economy.agents.get(agent_id) {
        if wallet.balance < cost {
            return Err(format!(
                "{} has insufficient tokens ({} available, {cost} required).",
                agent.name, wallet.balance
            ));
        }
        period_limit_blocks(
            cost,
            wallet.period_limit,
            wallet.period_spent,
            &format!("{}'s budget", agent.name),
        )?;
    } else if cost > 0 {
        return Err(format!(
            "{} has insufficient tokens (0 available, {cost} required).",
            agent.name
        ));
    }

    if let Some(wallet) = economy.departments.get(&department) {
        if wallet.balance < cost {
            return Err(format!(
                "{department} department has insufficient tokens ({} available, {cost} required).",
                wallet.balance
            ));
        }
        period_limit_blocks(
            cost,
            wallet.period_limit,
            wallet.period_spent,
            &format!("{department} department budget"),
        )?;
    }

    if total_company_tokens(economy) < cost {
        return Err(format!(
            "Company has insufficient tokens ({cost} required)."
        ));
    }

    Ok(())
}

pub fn charge_tokens(state: &mut AppState, ctx: ChargeContext) -> Result<(), String> {
    let cost = ctx.total_tokens as u64;
    if cost == 0 {
        append_ledger(state, ctx);
        return Ok(());
    }

    reset_token_budget_periods(state);
    can_afford(state, &ctx.agent_id, ctx.total_tokens)?;

    let department = ctx.department.clone();
    let agent_id = ctx.agent_id.clone();

    if let Some(wallet) = state.token_economy.agents.get_mut(&agent_id) {
        wallet.balance = wallet.balance.saturating_sub(cost);
        wallet.spent = wallet.spent.saturating_add(cost);
        if wallet.period_limit > 0 && wallet.period_type != "none" {
            if wallet.period_started_at.is_none() {
                wallet.period_started_at = Some(Utc::now().to_rfc3339());
            }
            wallet.period_spent = wallet.period_spent.saturating_add(cost);
        }
    }
    if let Some(wallet) = state.token_economy.departments.get_mut(&department) {
        wallet.balance = wallet.balance.saturating_sub(cost);
        wallet.spent = wallet.spent.saturating_add(cost);
        if wallet.period_limit > 0 && wallet.period_type != "none" {
            if wallet.period_started_at.is_none() {
                wallet.period_started_at = Some(Utc::now().to_rfc3339());
            }
            wallet.period_spent = wallet.period_spent.saturating_add(cost);
        }
    }
    state.token_economy.company_balance = state.token_economy.company_balance.saturating_sub(cost);

    append_ledger(state, ctx);
    apply_enforcement(state);
    Ok(())
}

fn append_ledger(state: &mut AppState, ctx: ChargeContext) {
    state.token_ledger.push(TokenUsageEntry {
        id: Uuid::new_v4().to_string(),
        at: Utc::now().to_rfc3339(),
        source: ctx.source,
        provider: ctx.provider,
        agent_id: Some(ctx.agent_id),
        department: ctx.department,
        prompt_tokens: ctx.prompt_tokens,
        completion_tokens: ctx.completion_tokens,
        total_tokens: ctx.total_tokens,
        usage_source: usage_source_label(ctx.usage_source),
    });
    if state.token_ledger.len() > LEDGER_CAP {
        let overflow = state.token_ledger.len() - LEDGER_CAP;
        state.token_ledger.drain(0..overflow);
    }
}

pub fn allocate_department_tokens(
    state: &mut AppState,
    department: &str,
    amount: u64,
) -> Result<(), String> {
    if amount == 0 {
        return Ok(());
    }
    if state.token_economy.company_balance < amount {
        return Err(format!(
            "Company pool has only {} tokens available.",
            state.token_economy.company_balance
        ));
    }
    ensure_department_wallet(&mut state.token_economy, department);
    state.token_economy.company_balance -= amount;
    let wallet = state.token_economy.departments.get_mut(department).unwrap();
    wallet.balance = wallet.balance.saturating_add(amount);
    wallet.allocated = wallet.allocated.saturating_add(amount);
    apply_enforcement(state);
    Ok(())
}

pub fn allocate_agent_tokens(
    state: &mut AppState,
    agent_id: &str,
    amount: u64,
) -> Result<(), String> {
    if amount == 0 {
        return Ok(());
    }
    let department = state
        .agents
        .get(agent_id)
        .ok_or_else(|| format!("Agent '{agent_id}' not found."))?
        .department
        .clone();
    ensure_department_wallet(&mut state.token_economy, &department);
    let dept_balance = state
        .token_economy
        .departments
        .get(&department)
        .map(|wallet| wallet.balance)
        .unwrap_or(0);
    if dept_balance < amount {
        return Err(format!(
            "{department} department has only {dept_balance} tokens available."
        ));
    }
    ensure_agent_wallet(&mut state.token_economy, state.agents.get(agent_id).unwrap());
    if let Some(wallet) = state.token_economy.departments.get_mut(&department) {
        wallet.balance = wallet.balance.saturating_sub(amount);
    }
    let wallet = state.token_economy.agents.get_mut(agent_id).unwrap();
    wallet.balance = wallet.balance.saturating_add(amount);
    wallet.allocated = wallet.allocated.saturating_add(amount);
    apply_enforcement(state);
    Ok(())
}

pub fn top_up_company_tokens(state: &mut AppState, amount: u64) {
    state.token_economy.company_balance = state.token_economy.company_balance.saturating_add(amount);
    apply_enforcement(state);
}

pub fn update_department_token_budget(
    state: &mut AppState,
    department: &str,
    period_limit: u64,
    period_type: &str,
    period_days: u32,
) -> Result<(), String> {
    ensure_department_wallet(&mut state.token_economy, department);
    let wallet = state
        .token_economy
        .departments
        .get_mut(department)
        .ok_or_else(|| format!("Department '{department}' not found."))?;
    let period_changed = wallet.period_type != period_type
        || wallet.period_days != period_days.max(1)
        || (wallet.period_limit == 0) != (period_limit == 0);
    wallet.period_limit = period_limit;
    wallet.period_type = if period_limit == 0 {
        "none".to_string()
    } else {
        period_type.to_string()
    };
    wallet.period_days = period_days.max(1);
    if period_changed || wallet.period_started_at.is_none() {
        wallet.period_spent = 0;
        wallet.period_started_at = if period_limit == 0 {
            None
        } else {
            Some(Utc::now().to_rfc3339())
        };
    }
    Ok(())
}

pub fn update_agent_token_budget(
    state: &mut AppState,
    agent_id: &str,
    period_limit: u64,
    period_type: &str,
    period_days: u32,
) -> Result<(), String> {
    let agent = state
        .agents
        .get(agent_id)
        .ok_or_else(|| format!("Agent '{agent_id}' not found."))?
        .clone();
    ensure_agent_wallet(&mut state.token_economy, &agent);
    let wallet = state
        .token_economy
        .agents
        .get_mut(agent_id)
        .ok_or_else(|| format!("Agent wallet '{agent_id}' not found."))?;
    let period_changed = wallet.period_type != period_type
        || wallet.period_days != period_days.max(1)
        || (wallet.period_limit == 0) != (period_limit == 0);
    wallet.period_limit = period_limit;
    wallet.period_type = if period_limit == 0 {
        "none".to_string()
    } else {
        period_type.to_string()
    };
    wallet.period_days = period_days.max(1);
    if period_changed || wallet.period_started_at.is_none() {
        wallet.period_spent = 0;
        wallet.period_started_at = if period_limit == 0 {
            None
        } else {
            Some(Utc::now().to_rfc3339())
        };
    }
    Ok(())
}

pub fn apply_enforcement(state: &mut AppState) {
    let company_depleted = total_company_tokens(&state.token_economy) == 0;
    state.token_economy.company_starved = company_depleted;

    let mut depleted_departments = std::collections::HashSet::new();
    for (department, wallet) in &state.token_economy.departments {
        if wallet.balance == 0 {
            depleted_departments.insert(department.clone());
        }
    }

    let mut depleted_agents = std::collections::HashSet::new();
    for (agent_id, wallet) in &state.token_economy.agents {
        if wallet.balance == 0 {
            depleted_agents.insert(agent_id.clone());
        }
    }

    for (agent_id, agent) in state.agents.iter_mut() {
        if agent.status == "meeting" {
            continue;
        }
        if company_depleted
            || depleted_departments.contains(&agent.department)
            || depleted_agents.contains(agent_id)
        {
            agent.status = "throttled".to_string();
            agent.energy = (agent.energy - 0.02).max(0.15);
            agent.morale = (agent.morale - 0.015).max(0.0);
        } else if agent.status == "throttled" {
            agent.status = "working".to_string();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{AgentRecord, AppState};

    fn sample_state() -> AppState {
        let mut state = AppState::default();
        state.agents.insert(
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
        state.token_economy.company_balance = 1000;
        rebalance_token_wallets(&mut state);
        state
    }

    #[test]
    fn charge_never_goes_negative() {
        let mut state = sample_state();
        let agent_id = "agent-1".to_string();
        let before_agent = state.token_economy.agents[&agent_id].balance;
        charge_tokens(
            &mut state,
            ChargeContext {
                source: "test".into(),
                agent_id: agent_id.clone(),
                department: "Engineering".into(),
                provider: "mock".into(),
                prompt_tokens: 10,
                completion_tokens: 20,
                total_tokens: 30,
                usage_source: TokenUsageSource::Estimated,
            },
        )
        .unwrap();
        assert_eq!(
            state.token_economy.agents[&agent_id].balance,
            before_agent - 30
        );
    }

    #[test]
    fn period_limit_blocks_overuse() {
        let mut state = sample_state();
        update_agent_token_budget(&mut state, "agent-1", 50, "monthly", 30).unwrap();
        state.token_economy.agents.get_mut("agent-1").unwrap().period_spent = 45;
        assert!(can_afford(&state, "agent-1", 10).is_err());
        assert!(can_afford(&state, "agent-1", 5).is_ok());
    }

    #[test]
    fn cannot_afford_when_depleted() {
        let mut state = sample_state();
        state.token_economy.agents.get_mut("agent-1").unwrap().balance = 0;
        apply_enforcement(&mut state);
        assert!(can_afford(&state, "agent-1", 1).is_err());
    }

}