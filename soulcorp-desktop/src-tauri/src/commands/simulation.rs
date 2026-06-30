use crate::achievements::evaluate;
use crate::commands::events::maybe_roll_event;
use crate::db::persistence::commit;
use crate::state::{AppState, GameEvent};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct SimulationTickResult {
    pub tick: u64,
    pub agents_active: u32,
    pub day_number: u32,
    pub cash_balance: f64,
    pub message: String,
    pub event: Option<GameEvent>,
}

#[tauri::command]
pub fn run_simulation_tick(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<SimulationTickResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.tick += 1;

    let compute_cost = state.agents.len() as f64 * 2.5;
    state.finance.compute_tokens = (state.finance.compute_tokens - compute_cost).max(0.0);
    state.finance.cash_balance -= compute_cost * 0.15;

    if state.tick % 30 == 0 {
        state.day_number += 1;
        state.finance.cash_balance += state.finance.monthly_revenue / 30.0;
    }

    for agent in state.agents.values_mut() {
        if agent.status != "meeting" {
            agent.energy = (agent.energy - 0.01).max(0.2);
            if agent.energy < 0.35 {
                agent.morale = (agent.morale - 0.02).max(0.0);
            }
        }
    }

    let event = if state.tick % 15 == 0 {
        maybe_roll_event(&mut state)
    } else {
        None
    };

    let agents_active = state
        .agents
        .values()
        .filter(|agent| agent.status == "working" || agent.status == "meeting")
        .count() as u32;

    if state.settings.backup_interval_minutes > 0 {
        let interval_ticks = state.settings.backup_interval_minutes as u64 * 60;
        if state.tick.saturating_sub(state.last_backup_tick) >= interval_ticks {
            state.last_backup_tick = state.tick;
        }
    }

    let _achievement_snapshot = evaluate(&mut state);

    let message = if let Some(event) = &event {
        format!(
            "Day {} tick {}: event triggered — {}",
            state.day_number, state.tick, event.title
        )
    } else {
        format!(
            "Day {} tick {}: simulation running with {} agents.",
            state.day_number,
            state.tick,
            state.agents.len()
        )
    };

    let result = SimulationTickResult {
        tick: state.tick,
        agents_active,
        day_number: state.day_number,
        cash_balance: state.finance.cash_balance,
        message,
        event,
    };
    commit(app, &state)?;
    Ok(result)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SimulationSnapshot {
    pub tick: u64,
    pub day_number: u32,
    pub agents_active: u32,
    pub cash_balance: f64,
    pub compute_tokens: f64,
}

#[tauri::command]
pub fn get_simulation_snapshot(
    state: State<'_, Mutex<AppState>>,
) -> Result<SimulationSnapshot, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let agents_active = state
        .agents
        .values()
        .filter(|agent| agent.status == "working" || agent.status == "meeting")
        .count() as u32;

    Ok(SimulationSnapshot {
        tick: state.tick,
        day_number: state.day_number,
        agents_active,
        cash_balance: state.finance.cash_balance,
        compute_tokens: state.finance.compute_tokens,
    })
}
