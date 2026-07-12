use crate::db::persistence::commit;
use crate::finance::normalize_allocations;
use crate::state::{AppState, InternalProject, TokenEconomy};
use crate::token_budget::ensure_agent_wallet;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

use crate::lock_util::MutexExt;
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
    let state = state.lock_or_recover()?;
    Ok(state.projects.clone())
}

#[tauri::command]
pub fn update_budget_allocations(
    update: BudgetUpdate,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<TokenEconomy, String> {
    use crate::app_log::{LogCategory, LogErr};
    let result = (|| {
        let mut state = state.lock_or_recover()?;

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
        commit(app.clone(), &state)?;
        Ok(economy)
    })();
    result.log_err(&app, LogCategory::Finance, "update_budget_allocations")
}

#[tauri::command]
pub fn adjust_agent_salary(
    update: SalaryUpdate,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<TokenEconomy, String> {
    use crate::app_log::{LogCategory, LogErr};
    let result = (|| {
        let mut state = state.lock_or_recover()?;
        let agent = state
            .agents
            .get_mut(&update.agent_id)
            .ok_or_else(|| "Agent not found.".to_string())?;

        agent.salary = update.salary.max(0.0);
        let wallet_record = state.agents.get(&update.agent_id).cloned();
        if let Some(record) = wallet_record {
            ensure_agent_wallet(&mut state.token_economy, &record);
        }

        let economy = state.token_economy.clone();
        commit(app.clone(), &state)?;
        Ok(economy)
    })();
    result.log_err(&app, LogCategory::Finance, "adjust_agent_salary")
}