use crate::achievements::evaluate;
use crate::commands::events::{apply_god_mode_reality_debt, maybe_roll_event};
use crate::commands::god_mode::apply_chaos_mode_tick;
use crate::commands::export::write_auto_backup;
use crate::db::persistence::commit;
use crate::finance::apply_tick_finance;
use crate::gigs::apply_gig_contract_ticks;
use crate::relationships::apply_relationship_tick;
use crate::state::{AppState, GameEvent};
use crate::workspace::{write_daily_activity_docs, write_event_activity_doc};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct SimulationTickResult {
    pub tick: u64,
    pub agents_active: u32,
    pub day_number: u32,
    pub cash_balance: f64,
    pub compute_tokens: f64,
    pub compute_starved: bool,
    pub cash_crisis: bool,
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
    apply_chaos_mode_tick(&mut state);

    let finance_result = apply_tick_finance(&mut state);
    let gig_result = apply_gig_contract_ticks(&mut state);
    if state.tick % 20 == 0 {
        apply_relationship_tick(&mut state);
    }
    let reality_note = apply_god_mode_reality_debt(&mut state);

    let event = if state.tick % 15 == 0 {
        maybe_roll_event(&mut state)
    } else {
        None
    };

    let mut workspace_note = None;
    if finance_result.daily_salary_paid > 0.0 {
        match write_daily_activity_docs(&app, &mut state) {
            Ok(count) => workspace_note = Some(format!("Workspace journals updated ({count} pages).")),
            Err(err) => workspace_note = Some(format!("Workspace journal update failed: {err}")),
        }
    }
    if let Some(ref game_event) = event {
        if let Err(err) = write_event_activity_doc(&app, &mut state, game_event) {
            workspace_note = Some(format!("Event workspace log failed: {err}"));
        }
    }

    let agents_active = state
        .agents
        .values()
        .filter(|agent| {
            agent.status == "working" || agent.status == "meeting" || agent.status == "throttled"
        })
        .count() as u32;

    if state.settings.backup_interval_minutes > 0 {
        let interval_ticks = state.settings.backup_interval_minutes as u64 * 60;
        if state.tick.saturating_sub(state.last_backup_tick) >= interval_ticks {
            write_auto_backup(&app, &state)?;
            state.last_backup_tick = state.tick;
        }
    }

    let _achievement_snapshot = evaluate(&mut state);

    let message = if finance_result.compute_starved {
        format!(
            "Day {}: compute tokens low — agents throttled.",
            state.day_number
        )
    } else if finance_result.cash_crisis {
        format!(
            "Day {}: cash crisis — salaries and morale under pressure.",
            state.day_number
        )
    } else if let Some(event) = &event {
        format!(
            "Day {} tick {}: event triggered — {}",
            state.day_number, state.tick, event.title
        )
    } else if let Some(note) = reality_note {
        note
    } else if gig_result.contracts_submitted_for_qc > 0 {
        format!(
            "Day {}: gig deliverable submitted for QC review.",
            state.day_number
        )
    } else if finance_result.daily_salary_paid > 0.0 {
        format!(
            "Day {} payroll processed (${:.0} salaries).",
            state.day_number, finance_result.daily_salary_paid
        )
    } else {
        format!(
            "Day {} tick {}: simulation running with {} agents.",
            state.day_number,
            state.tick,
            state.agents.len()
        )
    };

    let message = if let Some(note) = workspace_note {
        format!("{message} {note}")
    } else {
        message
    };

    let result = SimulationTickResult {
        tick: state.tick,
        agents_active,
        day_number: state.day_number,
        cash_balance: state.finance.cash_balance,
        compute_tokens: state.finance.compute_tokens,
        compute_starved: finance_result.compute_starved,
        cash_crisis: finance_result.cash_crisis,
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