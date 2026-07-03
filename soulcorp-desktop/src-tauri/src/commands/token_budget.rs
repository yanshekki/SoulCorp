use crate::ai::token_estimate;
use crate::db::persistence::commit;
use crate::state::{AppState, TokenEconomy, TokenUsageEntry};
use crate::token_budget::{
    allocate_agent_tokens, allocate_department_tokens, rebalance_token_wallets,
    total_company_tokens, update_agent_token_budget, update_department_token_budget,
};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

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
    let state = state.lock().map_err(|e| e.to_string())?;
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
    let state = state.lock().map_err(|e| e.to_string())?;
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

#[tauri::command]
pub fn allocate_department_tokens_cmd(
    request: DepartmentAllocationRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<TokenEconomy, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    allocate_department_tokens(&mut state, &request.department, request.amount)?;
    let economy = state.token_economy.clone();
    commit(app, &state)?;
    Ok(economy)
}

#[tauri::command]
pub fn allocate_agent_tokens_cmd(
    request: AgentAllocationRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<TokenEconomy, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    allocate_agent_tokens(&mut state, &request.agent_id, request.amount)?;
    let economy = state.token_economy.clone();
    commit(app, &state)?;
    Ok(economy)
}

#[tauri::command]
pub fn rebalance_token_wallets_cmd(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<TokenEconomy, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    rebalance_token_wallets(&mut state);
    let economy = state.token_economy.clone();
    commit(app, &state)?;
    Ok(economy)
}

#[tauri::command]
pub fn estimate_meeting_turn_cost(
    meeting_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<MeetingTurnCostEstimate, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
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
    let mut state = state.lock().map_err(|e| e.to_string())?;
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
    let mut state = state.lock().map_err(|e| e.to_string())?;
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
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.token_economy.clone())
}