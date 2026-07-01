use crate::db::persistence::commit;
use crate::finance::{normalize_allocations, total_monthly_salary};
use crate::state::{AppState, InternalProject, TokenEconomy};
use crate::token_budget::ensure_agent_wallet;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetUpdate {
    pub compute_pct: Option<f32>,
    pub salaries_pct: Option<f32>,
    pub marketing_pct: Option<f32>,
    pub rnd_pct: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SalaryUpdate {
    pub agent_id: String,
    pub salary: f32,
}

#[tauri::command]
pub fn list_internal_projects(
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<InternalProject>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.projects.clone())
}

#[tauri::command]
pub fn update_budget_allocations(
    update: BudgetUpdate,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<TokenEconomy, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    if let Some(value) = update.compute_pct {
        state.token_economy.allocations.compute_pct = value.max(0.0);
    }
    if let Some(value) = update.salaries_pct {
        state.token_economy.allocations.salaries_pct = value.max(0.0);
    }
    if let Some(value) = update.marketing_pct {
        state.token_economy.allocations.marketing_pct = value.max(0.0);
    }
    if let Some(value) = update.rnd_pct {
        state.token_economy.allocations.rnd_pct = value.max(0.0);
    }

    normalize_allocations(&mut state.token_economy.allocations);
    let economy = state.token_economy.clone();
    commit(app, &state)?;
    Ok(economy)
}

#[tauri::command]
pub fn adjust_agent_salary(
    update: SalaryUpdate,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<TokenEconomy, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    let agent = state
        .agents
        .get_mut(&update.agent_id)
        .ok_or_else(|| "Agent not found.".to_string())?;

    agent.salary = update.salary.max(0.0);
    let wallet_record = state.agents.get(&update.agent_id).cloned();
    if let Some(record) = wallet_record {
        ensure_agent_wallet(&mut state.token_economy, &record);
    }
    state.token_economy.monthly_burn_tokens =
        total_monthly_salary(&state.agents).saturating_add(state.agents.len() as u64 * 75);

    let economy = state.token_economy.clone();
    commit(app, &state)?;
    Ok(economy)
}