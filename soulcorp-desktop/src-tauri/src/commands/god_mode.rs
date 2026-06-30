use crate::db::persistence::commit;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GodModeActionResult {
    pub action: String,
    pub message: String,
    pub day_number: u32,
    pub cash_balance: f64,
    pub average_morale: f32,
}

#[tauri::command]
pub fn god_mode_time_warp(
    days: u32,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GodModeActionResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    if !state.settings.god_mode_enabled {
        return Err("God Mode is disabled in settings.".to_string());
    }

    state.stats.god_mode_uses += 1;
    state.day_number += days.max(1);
    state.finance.monthly_burn *= 1.02;
    state.finance.monthly_revenue *= 1.03;
    state.finance.cash_balance += state.finance.monthly_revenue * (days as f64 / 30.0);
    state.finance.compute_tokens -= state.finance.monthly_burn * 0.05;

    let result = build_result(
        &state,
        "time_warp",
        format!("Time warped forward by {days} day(s)."),
    );
    commit(app, &state)?;
    Ok(result)
}

#[tauri::command]
pub fn god_mode_mass_motivation(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GodModeActionResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    if !state.settings.god_mode_enabled {
        return Err("God Mode is disabled in settings.".to_string());
    }

    state.stats.god_mode_uses += 1;
    for agent in state.agents.values_mut() {
        agent.morale = (agent.morale + 0.15).min(1.0);
        agent.energy = (agent.energy + 0.1).min(1.0);
    }

    let result = build_result(
        &state,
        "mass_motivation",
        "Company-wide morale and energy received a divine boost.".to_string(),
    );
    commit(app, &state)?;
    Ok(result)
}

#[tauri::command]
pub fn god_mode_emergency_budget(
    amount: f64,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GodModeActionResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    if !state.settings.god_mode_enabled {
        return Err("God Mode is disabled in settings.".to_string());
    }

    state.stats.god_mode_uses += 1;
    state.finance.cash_balance += amount.max(0.0);
    state.finance.compute_tokens += amount.max(0.0) * 0.4;

    let result = build_result(
        &state,
        "emergency_budget",
        format!("Injected ${:.0} into the company budget.", amount.max(0.0)),
    );
    commit(app, &state)?;
    Ok(result)
}

fn build_result(state: &AppState, action: &str, message: String) -> GodModeActionResult {
    let morale_sum: f32 = state.agents.values().map(|agent| agent.morale).sum();
    let average_morale = if state.agents.is_empty() {
        0.0
    } else {
        morale_sum / state.agents.len() as f32
    };

    GodModeActionResult {
        action: action.to_string(),
        message,
        day_number: state.day_number,
        cash_balance: state.finance.cash_balance,
        average_morale,
    }
}
