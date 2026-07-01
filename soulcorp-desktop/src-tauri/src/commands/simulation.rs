use crate::achievements::evaluate;
use crate::commands::events::{apply_god_mode_reality_debt, maybe_roll_event};
use crate::commands::export::write_auto_backup;
use crate::commands::god_mode::apply_chaos_mode_tick;
use crate::commands::vip::apply_co_ceo_autonomy_tick;
use crate::db::persistence::commit_debounced;
use crate::finance::{apply_tick_finance, count_active_agents};
use crate::gigs::apply_gig_contract_ticks;
use crate::progress::ProgressReporter;
use crate::relationships::apply_relationship_tick;
use crate::state::{AppState, GameEvent};
use crate::workspace::{
    write_daily_activity_docs, write_event_activity_doc, ActivitySnapshot,
};
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

struct WorkspaceWriteOutcome {
    note: Option<String>,
    pages_written: u32,
}

#[tauri::command]
pub async fn run_simulation_tick(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<SimulationTickResult, String> {
    let progress = ProgressReporter::new(app.clone(), "sim_tick");
    progress.emit_percent("Starting simulation tick…", 5.0, Some("start"));

    let (mut tick_result, activity_snapshot, write_daily, event_for_workspace) = {
        let mut state = state.lock().map_err(|e| e.to_string())?;

        state.tick += 1;
        apply_chaos_mode_tick(&mut state);
        progress.emit_percent("Processing finance…", 20.0, Some("finance"));

        let finance_result = apply_tick_finance(&mut state);
        progress.emit_percent("Updating gig contracts…", 40.0, Some("gigs"));

        let gig_result = apply_gig_contract_ticks(&mut state);
        if state.tick % 20 == 0 {
            progress.emit_percent("Updating relationships…", 55.0, Some("relationships"));
            apply_relationship_tick(&mut state);
        }
        let co_ceo_note = apply_co_ceo_autonomy_tick(&mut state);
        let reality_note = apply_god_mode_reality_debt(&mut state);

        progress.emit_percent("Rolling events…", 70.0, Some("events"));
        let event = if state.tick % 15 == 0 {
            maybe_roll_event(&mut state)
        } else {
            None
        };

        let write_daily = finance_result.daily_salary_paid > 0.0;
        let activity_snapshot = ActivitySnapshot::from_state(&state);
        let event_for_workspace = event.clone();
        let agents_active = count_active_agents(&state, true);

        if state.settings.backup_interval_minutes > 0 {
            let interval_ticks = state.settings.backup_interval_minutes as u64 * 60;
            if state.tick.saturating_sub(state.last_backup_tick) >= interval_ticks {
                if let Err(err) = write_auto_backup(&app, &state) {
                    eprintln!("Auto-backup skipped: {err}");
                } else {
                    state.last_backup_tick = state.tick;
                }
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
        } else if let Some(note) = co_ceo_note {
            note
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

        (result, activity_snapshot, write_daily, event_for_workspace)
    };

    let workspace_outcome = if write_daily || event_for_workspace.is_some() {
        progress.emit_percent("Writing workspace journals…", 85.0, Some("journals"));
        let app_for_io = app.clone();
        let snapshot = activity_snapshot.clone();
        let event = event_for_workspace.clone();
        tokio::task::spawn_blocking(move || run_workspace_writes(&app_for_io, &snapshot, write_daily, event.as_ref()))
            .await
            .map_err(|e| e.to_string())?
    } else {
        Ok(WorkspaceWriteOutcome {
            note: None,
            pages_written: 0,
        })
    };

    match workspace_outcome {
        Ok(outcome) => {
            if let Some(note) = outcome.note {
                tick_result.message = format!("{} {note}", tick_result.message);
            }
            progress.emit_percent("Saving state…", 95.0, Some("commit"));
            let mut state = state.lock().map_err(|e| e.to_string())?;
            if outcome.pages_written > 0 {
                state.stats.pages_created += outcome.pages_written;
            }
            commit_debounced(app.clone(), &state)?;
        }
        Err(err) => {
            tick_result.message = format!("{} Workspace update failed: {err}", tick_result.message);
            progress.emit_percent("Saving state…", 95.0, Some("commit"));
            let state = state.lock().map_err(|e| e.to_string())?;
            commit_debounced(app.clone(), &state)?;
        }
    }

    progress.finish("Simulation tick complete");
    progress.clear();

    Ok(tick_result)
}

fn run_workspace_writes(
    app: &AppHandle,
    snapshot: &ActivitySnapshot,
    write_daily: bool,
    event: Option<&GameEvent>,
) -> Result<WorkspaceWriteOutcome, String> {
    let mut pages_written = 0u32;
    let mut notes = Vec::new();

    if write_daily {
        match write_daily_activity_docs(app, snapshot) {
            Ok(count) => {
                pages_written += count;
                notes.push(format!("Workspace journals updated ({count} pages)."));
            }
            Err(err) => notes.push(format!("Workspace journal update failed: {err}")),
        }
    }

    if let Some(game_event) = event {
        match write_event_activity_doc(app, snapshot, game_event) {
            Ok(count) => pages_written += count,
            Err(err) => notes.push(format!("Event workspace log failed: {err}")),
        }
    }

    Ok(WorkspaceWriteOutcome {
        note: if notes.is_empty() {
            None
        } else {
            Some(notes.join(" "))
        },
        pages_written,
    })
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
    let agents_active = count_active_agents(&state, true);

    Ok(SimulationSnapshot {
        tick: state.tick,
        day_number: state.day_number,
        agents_active,
        cash_balance: state.finance.cash_balance,
        compute_tokens: state.finance.compute_tokens,
    })
}