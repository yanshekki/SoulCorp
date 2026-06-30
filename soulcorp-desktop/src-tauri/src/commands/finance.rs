use crate::db::persistence::commit;
use crate::finance::{normalize_allocations, total_monthly_salary};
use crate::state::{AppState, BudgetAllocations, FinanceState, InternalProject};
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
pub fn get_finance_state(state: State<'_, Mutex<AppState>>) -> Result<FinanceState, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.finance.clone())
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
) -> Result<FinanceState, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    if let Some(value) = update.compute_pct {
        state.finance.allocations.compute_pct = value.max(0.0);
    }
    if let Some(value) = update.salaries_pct {
        state.finance.allocations.salaries_pct = value.max(0.0);
    }
    if let Some(value) = update.marketing_pct {
        state.finance.allocations.marketing_pct = value.max(0.0);
    }
    if let Some(value) = update.rnd_pct {
        state.finance.allocations.rnd_pct = value.max(0.0);
    }

    normalize_allocations(&mut state.finance.allocations);
    let finance = state.finance.clone();
    commit(app, &state)?;
    Ok(finance)
}

#[tauri::command]
pub fn adjust_agent_salary(
    update: SalaryUpdate,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<FinanceState, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    let agent = state
        .agents
        .get_mut(&update.agent_id)
        .ok_or_else(|| "Agent not found.".to_string())?;

    agent.salary = update.salary.max(0.0);
    state.finance.monthly_burn =
        total_monthly_salary(&state.agents) + state.agents.len() as f64 * 75.0;

    let finance = state.finance.clone();
    commit(app, &state)?;
    Ok(finance)
}