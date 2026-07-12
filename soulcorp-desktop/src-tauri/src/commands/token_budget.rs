use crate::ai::token_estimate;
use crate::db::persistence::commit;
use crate::state::{AppState, TokenEconomy, TokenUsageEntry};
use crate::token_budget::{
    allocate_agent_tokens, allocate_department_tokens, rebalance_token_wallets,
    resolve_alloc_amount, top_up_company_tokens, total_company_tokens,
    update_agent_token_budget, update_department_token_budget, UNLIMITED_ALLOC_PACK,
};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

use crate::lock_util::MutexExt;
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenEconomySnapshot {
    pub economy: TokenEconomy,
    pub total_tokens: u64,
    pub ledger: Vec<TokenUsageEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepartmentAllocationRequest {
    pub department: String,
    pub amount: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentAllocationRequest {
    pub agent_id: String,
    pub amount: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenBudgetPolicyRequest {
    pub period_limit: u64,
    pub period_type: String,
    pub period_days: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepartmentTokenBudgetRequest {
    pub department: String,
    pub policy: TokenBudgetPolicyRequest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTokenBudgetRequest {
    pub agent_id: String,
    pub policy: TokenBudgetPolicyRequest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingTurnCostEstimate {
    pub estimated_tokens: u32,
    pub affordable: bool,
    pub message: String,
}

#[tauri::command]
pub fn get_token_economy(state: State<'_, Mutex<AppState>>) -> Result<TokenEconomySnapshot, String> {
    let state = state.lock_or_recover()?;
    Ok(TokenEconomySnapshot {
        total_tokens: total_company_tokens(&state.token_economy),
        economy: state.token_economy.clone(),
        ledger: state.token_ledger.iter().rev().take(50).cloned().collect(),
    })
}

#[tauri::command]
pub fn get_token_usage_ledger(
    department: Option<String>,
    agent_id: Option<String>,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<TokenUsageEntry>, String> {
    let state = state.lock_or_recover()?;
    Ok(state
        .token_ledger
        .iter()
        .rev()
        .filter(|entry| {
            department
                .as_ref()
                .map(|value| &entry.department == value)
                .unwrap_or(true)
                && agent_id
                    .as_ref()
                    .map(|value| entry.agent_id.as_deref() == Some(value.as_str()))
                    .unwrap_or(true)
        })
        .take(100)
        .cloned()
        .collect())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllocationResult {
    pub economy: TokenEconomy,
    pub amount_applied: u64,
    /// True when the UI sent 0 and we applied the unlimited pack.
    pub used_unlimited_pack: bool,
    pub message: String,
}

#[tauri::command]
pub fn allocate_department_tokens_cmd(
    request: DepartmentAllocationRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AllocationResult, String> {
    let mut state = state.lock_or_recover()?;
    let used_unlimited_pack = request.amount == 0;
    let amount_applied = resolve_alloc_amount(request.amount);
    allocate_department_tokens(&mut state, &request.department, request.amount)?;
    let economy = state.token_economy.clone();
    commit(app, &state)?;
    let message = if used_unlimited_pack {
        format!(
            "Filled {} with {} tokens (0 = unlimited pack of {}).",
            request.department,
            amount_applied,
            UNLIMITED_ALLOC_PACK
        )
    } else {
        format!(
            "Allocated {} tokens to {}.",
            amount_applied, request.department
        )
    };
    Ok(AllocationResult {
        economy,
        amount_applied,
        used_unlimited_pack,
        message,
    })
}

#[tauri::command]
pub fn allocate_agent_tokens_cmd(
    request: AgentAllocationRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AllocationResult, String> {
    let mut state = state.lock_or_recover()?;
    let used_unlimited_pack = request.amount == 0;
    let amount_applied = resolve_alloc_amount(request.amount);
    allocate_agent_tokens(&mut state, &request.agent_id, request.amount)?;
    let name = state
        .agents
        .get(&request.agent_id)
        .map(|a| a.name.clone())
        .unwrap_or_else(|| request.agent_id.clone());
    let economy = state.token_economy.clone();
    commit(app, &state)?;
    let message = if used_unlimited_pack {
        format!(
            "Filled {name} with {amount_applied} tokens (0 = unlimited pack of {UNLIMITED_ALLOC_PACK})."
        )
    } else {
        format!("Allocated {amount_applied} tokens to {name}.")
    };
    Ok(AllocationResult {
        economy,
        amount_applied,
        used_unlimited_pack,
        message,
    })
}

#[tauri::command]
pub fn rebalance_token_wallets_cmd(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<TokenEconomy, String> {
    let mut state = state.lock_or_recover()?;
    rebalance_token_wallets(&mut state);
    let economy = state.token_economy.clone();
    commit(app, &state)?;
    Ok(economy)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanyPoolUpdateRequest {
    /// Absolute company pool balance after the update (Set).
    #[serde(default)]
    pub set_to: Option<u64>,
    /// Add this many tokens to the company pool (Top up).
    #[serde(default)]
    pub add: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanyPoolUpdateResult {
    pub economy: TokenEconomy,
    pub company_balance: u64,
    pub message: String,
}

/// Set or top up the unallocated company token pool (Tokens → Overview).
/// Replaces God Mode emergency budget for product editions without God Mode.
#[tauri::command]
pub fn update_company_pool_cmd(
    request: CompanyPoolUpdateRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<CompanyPoolUpdateResult, String> {
    let mut state = state.lock_or_recover()?;
    let before = state.token_economy.company_balance;

    if let Some(target) = request.set_to {
        state.token_economy.company_balance = target;
        crate::token_budget::apply_enforcement(&mut state);
    } else if let Some(add) = request.add {
        if add == 0 {
            return Err("Enter a positive amount to add, or use Set to.".into());
        }
        top_up_company_tokens(&mut state, add);
    } else {
        return Err("Provide set_to (absolute) or add (top-up amount).".into());
    }

    let after = state.token_economy.company_balance;
    let economy = state.token_economy.clone();
    commit(app, &state)?;
    let message = if request.set_to.is_some() {
        format!(
            "Company pool set to {} tokens (was {}).",
            after, before
        )
    } else {
        format!(
            "Company pool topped up: {} → {} tokens.",
            before, after
        )
    };
    Ok(CompanyPoolUpdateResult {
        economy,
        company_balance: after,
        message,
    })
}

#[tauri::command]
pub fn estimate_meeting_turn_cost(
    meeting_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<MeetingTurnCostEstimate, String> {
    let state = state.lock_or_recover()?;
    let meeting = state
        .meetings
        .get(&meeting_id)
        .ok_or_else(|| "Meeting not found.".to_string())?;
    if meeting.completed {
        return Ok(MeetingTurnCostEstimate {
            estimated_tokens: 0,
            affordable: true,
            message: "Meeting already completed.".to_string(),
        });
    }
    let speaker_id = meeting
        .participant_ids
        .get(meeting.turn % meeting.participant_ids.len())
        .cloned()
        .ok_or_else(|| "Meeting has no participants.".to_string())?;
    let agent = state
        .agents
        .get(&speaker_id)
        .ok_or_else(|| "Speaker agent not found.".to_string())?;
    let estimate = token_estimate::estimate_request(&crate::ai::provider::ChatRequest {
        system_prompt: "meeting".into(),
        user_prompt: meeting.meeting_type.clone(),
        temperature: 0.7,
        soul_id: agent.soul_id,
        context: None,
        conversation_turns: Vec::new(),
    });
    let affordable = crate::token_budget::can_afford(&state, &speaker_id, estimate).is_ok();
    Ok(MeetingTurnCostEstimate {
        estimated_tokens: estimate,
        affordable,
        message: if affordable {
            format!("Next turn will use about {estimate} tokens.")
        } else {
            format!(
                "{} or {} lacks tokens for ~{estimate} tokens.",
                agent.name, agent.department
            )
        },
    })
}

#[tauri::command]
pub fn update_department_token_budget_cmd(
    request: DepartmentTokenBudgetRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<TokenEconomy, String> {
    let mut state = state.lock_or_recover()?;
    update_department_token_budget(
        &mut state,
        &request.department,
        request.policy.period_limit,
        &request.policy.period_type,
        request.policy.period_days.unwrap_or(30),
    )?;
    let economy = state.token_economy.clone();
    commit(app, &state)?;
    Ok(economy)
}

#[tauri::command]
pub fn update_agent_token_budget_cmd(
    request: AgentTokenBudgetRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<TokenEconomy, String> {
    let mut state = state.lock_or_recover()?;
    update_agent_token_budget(
        &mut state,
        &request.agent_id,
        request.policy.period_limit,
        &request.policy.period_type,
        request.policy.period_days.unwrap_or(30),
    )?;
    let economy = state.token_economy.clone();
    commit(app, &state)?;
    Ok(economy)
}

#[tauri::command]
pub fn get_finance_state(state: State<'_, Mutex<AppState>>) -> Result<TokenEconomy, String> {
    let state = state.lock_or_recover()?;
    Ok(state.token_economy.clone())
}