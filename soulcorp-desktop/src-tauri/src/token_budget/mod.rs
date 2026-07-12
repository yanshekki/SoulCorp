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

/// Exclusive hierarchical pool: company unallocated + department unallocated + agent balances.
/// Each token exists in exactly one of these buckets.
pub fn total_company_tokens(economy: &TokenEconomy) -> u64 {
    economy
        .company_balance
        .saturating_add(sum_department_balances(economy))
        .saturating_add(sum_agent_balances(economy))
}

fn sum_department_balances(economy: &TokenEconomy) -> u64 {
    economy
        .departments
        .values()
        .fold(0u64, |acc, wallet| acc.saturating_add(wallet.balance))
}

fn sum_agent_balances(economy: &TokenEconomy) -> u64 {
    economy
        .agents
        .values()
        .fold(0u64, |acc, wallet| acc.saturating_add(wallet.balance))
}

/// Recover the true exclusive total, deduping the legacy bug where rebalance mirrored
/// agent balances onto department wallets (same tokens counted twice).
///
/// Per-department only: if a department's balance equals the sum of its agents'
/// balances, treat that dept balance as a mirror and do not count it again.
/// Coincidental global equality of total depts vs total agents is NOT treated as
/// a mirror when individual departments do not match their agent sums.
fn exclusive_token_total_with_agents(state: &AppState) -> u64 {
    let economy = &state.token_economy;
    let company = economy.company_balance;
    let depts = sum_department_balances(economy);
    let agents = sum_agent_balances(economy);

    if agents == 0 {
        return company.saturating_add(depts);
    }
    if depts == 0 {
        return company.saturating_add(agents);
    }

    let mut agents_by_dept: HashMap<String, u64> = HashMap::new();
    for (agent_id, wallet) in &economy.agents {
        let dept = state
            .agents
            .get(agent_id)
            .map(|a| a.department.clone())
            .unwrap_or_else(|| "Unknown".to_string());
        let entry = agents_by_dept.entry(dept).or_insert(0);
        *entry = entry.saturating_add(wallet.balance);
    }

    let mut total = company.saturating_add(agents);
    for (dept, wallet) in &economy.departments {
        let agent_sum = agents_by_dept.get(dept).copied().unwrap_or(0);
        // Pure mirror of that department's agents → skip.
        if wallet.balance == agent_sum && agent_sum > 0 {
            continue;
        }
        total = total.saturating_add(wallet.balance);
    }
    total
}

pub fn ensure_department_wallet(economy: &mut TokenEconomy, department: &str) {
    economy
        .departments
        .entry(department.to_string())
        .or_default();
}

pub fn ensure_agent_wallet(economy: &mut TokenEconomy, agent: &AgentRecord) {
    ensure_department_wallet(economy, &agent.department);
    economy
        .agents
        .entry(agent.id.clone())
        .or_default();
}

pub fn initialize_wallets_from_agents(state: &mut AppState) {
    let has_funds = state.token_economy.company_balance > 0
        || !state.token_economy.departments.is_empty()
        || !state.token_economy.agents.is_empty();
    let total = if has_funds {
        exclusive_token_total_with_agents(state)
    } else {
        15_000
    };
    state.token_economy.company_balance = total;
    state.token_economy.departments.clear();
    state.token_economy.agents.clear();
    rebalance_token_wallets(state);
}

/// Fix legacy mirrored / double-counted wallets after load (safe to call every boot).
pub fn heal_token_economy_on_load(state: &mut AppState) {
    if state.agents.is_empty() {
        return;
    }
    let raw_total = total_company_tokens(&state.token_economy);
    let exclusive = exclusive_token_total_with_agents(state);
    if raw_total == exclusive {
        return;
    }
    // Collapse to exclusive total and re-distribute without double-counting.
    state.token_economy.company_balance = exclusive.max(1);
    state.token_economy.departments.clear();
    state.token_economy.agents.clear();
    rebalance_token_wallets(state);
}

pub fn rebalance_token_wallets(state: &mut AppState) {
    let agents: Vec<AgentRecord> = state.agents.values().cloned().collect();
    if agents.is_empty() {
        return;
    }

    // Exclusive total (dedupes legacy mirrored dept/agent double-count).
    let total = exclusive_token_total_with_agents(state).max(1);
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
        // Exclusive model: push all department share into agent wallets.
        // Department balance stays 0 (unallocated pool empty); `allocated` tracks the share.
        let dept_wallet = DepartmentTokenWallet {
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

    // Spend from the agent leaf wallet (exclusive pool).
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

    // Department period caps only — dept.balance is an unallocated pool, not a mirror.
    if let Some(wallet) = economy.departments.get(&department) {
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

    // Debit only the agent leaf wallet (exclusive). Do not also subtract dept/company —
    // that double/triple-counted spend under the old model.
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

    // Track department period spend without moving exclusive balances again.
    if let Some(wallet) = state.token_economy.departments.get_mut(&department) {
        wallet.spent = wallet.spent.saturating_add(cost);
        if wallet.period_limit > 0 && wallet.period_type != "none" {
            if wallet.period_started_at.is_none() {
                wallet.period_started_at = Some(Utc::now().to_rfc3339());
            }
            wallet.period_spent = wallet.period_spent.saturating_add(cost);
        }
    }

    append_ledger(state, ctx);
    apply_enforcement(state);
    Ok(())
}

/// Company-paid fees (hire onboarding, etc.): never require the new agent leaf wallet.
/// Pulls into company unallocated first, then debits company_balance.
pub fn charge_company_pool(
    state: &mut AppState,
    cost: u32,
    ctx: ChargeContext,
) -> Result<(), String> {
    let cost = cost as u64;
    if cost == 0 {
        append_ledger(state, ctx);
        return Ok(());
    }

    reset_token_budget_periods(state);
    let total = total_company_tokens(&state.token_economy);
    if total < cost {
        return Err(format!(
            "公司代幣不足：需要 {cost} tokens（目前約 {total}）。請到「代幣」頁注資後再雇用。"
        ));
    }

    // Move enough into company unallocated from dept/agent pools if needed.
    let mut need = cost.saturating_sub(state.token_economy.company_balance);
    if need > 0 {
        // Drain department unallocated first.
        let dept_keys: Vec<String> = state.token_economy.departments.keys().cloned().collect();
        for key in dept_keys {
            if need == 0 {
                break;
            }
            let Some(wallet) = state.token_economy.departments.get_mut(&key) else {
                continue;
            };
            let take = need.min(wallet.balance);
            if take == 0 {
                continue;
            }
            wallet.balance = wallet.balance.saturating_sub(take);
            state.token_economy.company_balance =
                state.token_economy.company_balance.saturating_add(take);
            need = need.saturating_sub(take);
        }
    }
    if need > 0 {
        // Then drain existing agent wallets (not required for hire semantics).
        let agent_keys: Vec<String> = state.token_economy.agents.keys().cloned().collect();
        for key in agent_keys {
            if need == 0 {
                break;
            }
            let Some(wallet) = state.token_economy.agents.get_mut(&key) else {
                continue;
            };
            let take = need.min(wallet.balance);
            if take == 0 {
                continue;
            }
            wallet.balance = wallet.balance.saturating_sub(take);
            state.token_economy.company_balance =
                state.token_economy.company_balance.saturating_add(take);
            need = need.saturating_sub(take);
        }
    }

    if state.token_economy.company_balance < cost {
        return Err(format!(
            "公司代幣不足：需要 {cost} tokens。請到「代幣」頁注資後再雇用。"
        ));
    }

    state.token_economy.company_balance = state
        .token_economy
        .company_balance
        .saturating_sub(cost);

    // Record period spend on department if present (analytics only).
    if let Some(wallet) = state.token_economy.departments.get_mut(&ctx.department) {
        wallet.spent = wallet.spent.saturating_add(cost);
    }

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

/// When the UI sends amount `0`, treat it as an unlimited operating pack.
/// (Period limit 0 already means unlimited caps; this fills a large balance.)
pub const UNLIMITED_ALLOC_PACK: u64 = 1_000_000;

/// `0` → unlimited pack; otherwise the explicit amount.
pub fn resolve_alloc_amount(amount: u64) -> u64 {
    if amount == 0 {
        UNLIMITED_ALLOC_PACK
    } else {
        amount
    }
}

fn ensure_company_pool(state: &mut AppState, need: u64) {
    if need == 0 {
        return;
    }
    let available = state.token_economy.company_balance;
    if available < need {
        top_up_company_tokens(state, need - available);
    }
}

pub fn allocate_department_tokens(
    state: &mut AppState,
    department: &str,
    amount: u64,
) -> Result<(), String> {
    let amount = resolve_alloc_amount(amount);
    if amount == 0 {
        return Ok(());
    }
    // Auto-mint into company pool so empty company does not soft-fail the UI.
    ensure_company_pool(state, amount);
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
    let amount = resolve_alloc_amount(amount);
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
    // Pull from company → department when the dept pool is empty/short.
    if dept_balance < amount {
        let gap = amount - dept_balance;
        allocate_department_tokens(state, &department, gap)?;
    }
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

/// Ensure an assignee has enough leaf-wallet balance for sprint execution.
/// Mints into company pool if needed (same path as meeting fund) so empty wallets
/// do not permanently THROTTLE work while company can still top up.
pub fn fund_agent_for_execution(state: &mut AppState, agent_id: &str, min_balance: u64) {
    let target = min_balance.max(25_000).min(UNLIMITED_ALLOC_PACK);
    fund_meeting_participants(state, &[agent_id.to_string()], target);
}

/// Ensure meeting participants can afford multi-turn chat (internal wallet economy).
/// Used when a meeting starts so cloud-key users are not blocked by empty leaf wallets.
pub fn fund_meeting_participants(state: &mut AppState, agent_ids: &[String], per_agent: u64) {
    if agent_ids.is_empty() || per_agent == 0 {
        return;
    }
    let total = per_agent.saturating_mul(agent_ids.len() as u64);
    top_up_company_tokens(state, total);
    for agent_id in agent_ids {
        let Some(agent) = state.agents.get(agent_id).cloned() else {
            continue;
        };
        ensure_department_wallet(&mut state.token_economy, &agent.department);
        ensure_agent_wallet(&mut state.token_economy, &agent);
        // Move from company → dept → agent if needed.
        let need = {
            let bal = state
                .token_economy
                .agents
                .get(agent_id)
                .map(|w| w.balance)
                .unwrap_or(0);
            per_agent.saturating_sub(bal)
        };
        if need == 0 {
            continue;
        }
        // Ensure department has enough unallocated by topping company→dept.
        let dept_bal = state
            .token_economy
            .departments
            .get(&agent.department)
            .map(|w| w.balance)
            .unwrap_or(0);
        if dept_bal < need {
            let gap = need - dept_bal;
            if state.token_economy.company_balance < gap {
                top_up_company_tokens(state, gap);
            }
            let _ = allocate_department_tokens(state, &agent.department, gap);
        }
        let _ = allocate_agent_tokens(state, agent_id, need);
    }
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

    // Per-agent leaf wallets only. Department balance 0 is normal after rebalance
    // (all share pushed to agents) and must not mass-throttle the department.
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
        if company_depleted || depleted_agents.contains(agent_id) {
            agent.status = "throttled".to_string();
            agent.energy = (agent.energy - 0.02).max(0.15);
            agent.morale = (agent.morale - 0.015).max(0.0);
        } else if agent.status == "throttled" {
            // Back to free pool — not actively executing a task.
            agent.status = "idle".to_string();
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
            agent_runtime_mode: None,
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
        let before_total = total_company_tokens(&state.token_economy);
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
        assert_eq!(
            total_company_tokens(&state.token_economy),
            before_total - 30,
            "charge must reduce exclusive total by exactly cost"
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

    #[test]
    fn rebalance_preserves_exclusive_total() {
        let mut state = sample_state();
        assert_eq!(total_company_tokens(&state.token_economy), 1000);
        // After rebalance, all funds sit on agents; dept unallocated is 0.
        assert_eq!(
            state.token_economy.departments["Engineering"].balance,
            0
        );
        assert_eq!(state.token_economy.agents["agent-1"].balance, 1000);

        // Second rebalance must not inflate.
        rebalance_token_wallets(&mut state);
        assert_eq!(total_company_tokens(&state.token_economy), 1000);
        rebalance_token_wallets(&mut state);
        assert_eq!(total_company_tokens(&state.token_economy), 1000);
    }

    #[test]
    fn rebalance_dedupes_legacy_mirrored_dept_balances() {
        let mut state = sample_state();
        // Simulate old bug: dept balance mirrored agent balance → total would be 2000.
        state.token_economy.departments.get_mut("Engineering").unwrap().balance = 1000;
        assert_eq!(
            exclusive_token_total_with_agents(&state),
            1000,
            "mirrored dept must not double-count"
        );
        rebalance_token_wallets(&mut state);
        assert_eq!(total_company_tokens(&state.token_economy), 1000);
    }

    #[test]
    fn allocate_department_then_agent_preserves_total() {
        let mut state = sample_state();
        // Pull some tokens back to company via top-up for allocation path.
        top_up_company_tokens(&mut state, 500);
        assert_eq!(total_company_tokens(&state.token_economy), 1500);

        // Move 200 from company → dept unallocated (agents still hold 1000).
        // First return 200 from agent to company by manual adjust for a clean path:
        state.token_economy.agents.get_mut("agent-1").unwrap().balance = 800;
        state.token_economy.company_balance = 700; // 800 agent + 700 company = 1500
        allocate_department_tokens(&mut state, "Engineering", 200).unwrap();
        assert_eq!(total_company_tokens(&state.token_economy), 1500);
        assert_eq!(state.token_economy.departments["Engineering"].balance, 200);

        allocate_agent_tokens(&mut state, "agent-1", 100).unwrap();
        assert_eq!(total_company_tokens(&state.token_economy), 1500);
        assert_eq!(state.token_economy.agents["agent-1"].balance, 900);
        assert_eq!(state.token_economy.departments["Engineering"].balance, 100);
    }

    #[test]
    fn rebalance_does_not_throttle_when_dept_unallocated_is_zero() {
        let mut state = sample_state();
        state.agents.get_mut("agent-1").unwrap().status = "idle".to_string();
        apply_enforcement(&mut state);
        assert_ne!(
            state.agents["agent-1"].status,
            "throttled",
            "dept balance 0 after rebalance must not throttle funded agents"
        );
    }

}