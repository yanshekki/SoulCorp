use crate::achievements::evaluate;
use crate::config;
use crate::commands::events::{apply_god_mode_reality_debt, should_attempt_fate_event};
use crate::commands::export::write_auto_backup;
use crate::commands::god_mode::apply_chaos_mode_tick;
use crate::commands::vip::apply_co_ceo_autonomy_tick;
use crate::db::persistence::commit_debounced;
use crate::finance::{apply_tick_finance, count_active_agents};
use crate::token_budget::{reset_token_budget_periods, total_company_tokens};
use crate::fate::events::generate_and_apply_fate_event;
use crate::gigs::apply_gig_contract_ticks;
use crate::progress::ProgressReporter;
use crate::relationships::apply_relationship_tick;
use crate::state::{AppState, GameEvent};
use crate::workspace::{
    write_daily_activity_docs, write_event_activity_doc, ActivitySnapshot,
};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct SimulationTickResult {
    pub tick: u64,
    pub agents_active: u32,
    pub day_number: u32,
    pub token_balance: u64,
    pub total_tokens: u64,
    pub company_starved: bool,
    pub message: String,
    pub event: Option<GameEvent>,
}

struct WorkspaceWriteOutcome {
    note: Option<String>,
    pages_written: u32,
}

struct TickSnapshot {
    activity_snapshot: ActivitySnapshot,
    write_daily: bool,
    try_fate_event: bool,
    finance_starved: bool,
    finance_daily_salary_paid: u64,
    gig_submitted: bool,
    co_ceo_note: Option<String>,
    reality_note: Option<String>,
    agents_active: u32,
    tick: u64,
    day_number: u32,
    token_balance: u64,
    total_tokens: u64,
    company_starved: bool,
}

#[tauri::command]
pub async fn run_simulation_tick(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<SimulationTickResult, String> {
    if config::is_v1() {
        return Err(
            "Simulation ticks are only available in SoulCorp Simulator (v2).".into(),
        );
    }

    let progress = ProgressReporter::new(app.clone(), "sim_tick");
    progress.emit_percent("Starting simulation tick…", 5.0, Some("start"));

    let snapshot = {
        let mut state = state.lock().map_err(|e| e.to_string())?;

        state.tick += 1;
        reset_token_budget_periods(&mut state);
        if config::is_v2() {
            apply_chaos_mode_tick(&mut state);
        }
        progress.emit_percent("Processing finance…", 20.0, Some("finance"));

        let finance_result = apply_tick_finance(&mut state);
        progress.emit_percent("Updating gig contracts…", 40.0, Some("gigs"));

        let gig_result = apply_gig_contract_ticks(&mut state);
        if config::is_v2() && state.tick % 20 == 0 {
            progress.emit_percent("Updating relationships…", 55.0, Some("relationships"));
            apply_relationship_tick(&mut state);
        }
        let co_ceo_note = apply_co_ceo_autonomy_tick(&mut state, &app);
        crate::scrum::advance_sprint_lifecycle(&mut state);
        let reality_note = if config::is_v2() {
            apply_god_mode_reality_debt(&mut state)
        } else {
            None
        };

        let try_fate_event = config::is_v2()
            && state.tick % 15 == 0
            && should_attempt_fate_event(&state);

        let write_daily = finance_result.daily_salary_paid > 0;
        let activity_snapshot = ActivitySnapshot::from_state(&state);
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

        TickSnapshot {
            activity_snapshot,
            write_daily,
            try_fate_event,
            finance_starved: finance_result.company_starved,
            finance_daily_salary_paid: finance_result.daily_salary_paid,
            gig_submitted: gig_result.contracts_submitted_for_qc > 0,
            co_ceo_note,
            reality_note,
            agents_active,
            tick: state.tick,
            day_number: state.day_number,
            token_balance: state.token_economy.company_balance,
            total_tokens: total_company_tokens(&state.token_economy),
            company_starved: finance_result.company_starved,
        }
    };

    let scrum_note = {
        let mut locked = state.lock().map_err(|e| e.to_string())?;
        let note = if locked.settings.scrum_worker_enabled {
            None
        } else {
            crate::scrum::apply_scrum_execution_tick(&mut locked, &app)
        };
        if note.is_some() {
            let _ = commit_debounced(app.clone(), &locked);
        }
        note
    };

    let event = if snapshot.try_fate_event {
        progress.emit_indeterminate("Fate is weaving an event…", Some("fate"));
        let app_for_fate = app.clone();
        match tokio::task::spawn_blocking(move || {
            let mutex = app_for_fate.state::<Mutex<AppState>>();
            let mut state = mutex.lock().map_err(|e| e.to_string())?;
            Ok::<_, String>(generate_and_apply_fate_event(&mut state))
        })
        .await
        {
            Ok(Ok(generated)) => generated,
            Ok(Err(error)) => {
                eprintln!("Fate event tick failed: {error}");
                None
            }
            Err(error) => {
                eprintln!("Fate event task failed: {error}");
                None
            }
        }
    } else {
        None
    };

    let message = if snapshot.finance_starved {
        format!(
            "Day {}: token balance depleted — agents throttled.",
            snapshot.day_number
        )
    } else if let Some(event) = &event {
        format!(
            "Day {} tick {}: Fate triggered — {}",
            snapshot.day_number, snapshot.tick, event.title
        )
    } else if let Some(note) = snapshot.co_ceo_note {
        note
    } else if let Some(note) = snapshot.reality_note {
        note
    } else if snapshot.gig_submitted {
        format!(
            "Day {}: gig deliverable submitted for QC review.",
            snapshot.day_number
        )
    } else if let Some(note) = scrum_note {
        format!("Day {}: {note}", snapshot.day_number)
    } else if snapshot.finance_daily_salary_paid > 0 {
        format!(
            "Day {} payroll processed ({} tokens).",
            snapshot.day_number, snapshot.finance_daily_salary_paid
        )
    } else {
        format!(
            "Day {} tick {}: simulation running with {} agents.",
            snapshot.day_number,
            snapshot.tick,
            snapshot.agents_active
        )
    };

    let mut tick_result = SimulationTickResult {
        tick: snapshot.tick,
        agents_active: snapshot.agents_active,
        day_number: snapshot.day_number,
        token_balance: snapshot.token_balance,
        total_tokens: snapshot.total_tokens,
        company_starved: snapshot.company_starved,
        message,
        event,
    };

    let workspace_outcome = if snapshot.write_daily || tick_result.event.is_some() {
        progress.emit_percent("Writing workspace journals…", 85.0, Some("journals"));
        let app_for_io = app.clone();
        let activity_snapshot = snapshot.activity_snapshot.clone();
        let event_for_workspace = tick_result.event.clone();
        tokio::task::spawn_blocking(move || {
            run_workspace_writes(
                &app_for_io,
                &activity_snapshot,
                snapshot.write_daily,
                event_for_workspace.as_ref(),
            )
        })
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
            if config::is_v2() {
                let _achievement_snapshot = evaluate(&mut state);
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
    pub token_balance: u64,
    pub total_tokens: u64,
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
        token_balance: state.token_economy.company_balance,
        total_tokens: total_company_tokens(&state.token_economy),
    })
}