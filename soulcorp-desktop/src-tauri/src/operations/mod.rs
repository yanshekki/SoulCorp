use crate::config;
use crate::scrum::executor::apply_scrum_execution_tick;
use crate::scrum::types::ExecutionStatus;
use crate::state::AppState;
use tauri::AppHandle;

/// v1 work platform: no simulation calendar — reset stale game day/tick on load.
pub fn normalize_v1_operational_state(state: &mut AppState) {
    if !config::is_v1() {
        return;
    }
    state.day_number = 1;
    state.tick = 0;
}

/// Advance marketplace contracts when real task deliverables complete (v1 path).
pub fn advance_gigs_on_work_delivered(state: &mut AppState, tokens_used: u64) -> u32 {
    if state.gig_contracts.is_empty() {
        return 0;
    }

    let delta = if tokens_used > 0 {
        (tokens_used as f32 / 4000.0).clamp(0.1, 0.35)
    } else {
        0.15
    };

    let mut advanced = 0u32;
    for contract in state.gig_contracts.iter_mut() {
        if contract.status != "in_progress" {
            continue;
        }
        let previous = contract.progress;
        contract.progress = (contract.progress + delta).min(1.0);
        if contract.progress > previous {
            advanced += 1;
        }
    }
    advanced
}

/// Run scrum auto-execute after real work actions (v1 + v2 operational path).
pub fn try_scrum_auto_execute_after_work(
    state: &mut AppState,
    app: &AppHandle,
) -> Option<String> {
    if config::is_v2() || state.settings.scrum_worker_enabled {
        return None;
    }
    if !state.settings.scrum_auto_execute || state.settings.scrum_execution_paused {
        return None;
    }

    let max_runs = state.settings.scrum_max_executions_per_tick.max(1);
    let mut notes = Vec::new();
    for _ in 0..max_runs {
        match apply_scrum_execution_tick(state, app) {
            Some(note) => notes.push(note),
            None => break,
        }
    }

    if notes.is_empty() {
        None
    } else {
        Some(notes.join(" "))
    }
}

pub fn gig_ready_for_qc(state: &AppState, contract: &crate::state::GigContract) -> Result<(), String> {
    if contract.progress >= 0.95 {
        return Ok(());
    }

    if config::is_v1() {
        let started_at = contract.started_at.as_deref().unwrap_or("");
        let deliverables = state
            .execution_runs
            .iter()
            .filter(|run| {
                run.status == ExecutionStatus::Succeeded
                    && run
                        .finished_at
                        .as_deref()
                        .is_some_and(|finished| finished >= started_at)
            })
            .count();

        if deliverables >= 1 && contract.progress >= 0.25 {
            return Ok(());
        }

        return Err(format!(
            "Deliver at least one approved task output to reach QC readiness ({:.0}% complete). Run and approve backlog executions to advance this contract.",
            contract.progress * 100.0
        ));
    }

    Err(format!(
        "Work is only {:.0}% complete. Keep agents working or wait for simulation ticks.",
        contract.progress * 100.0
    ))
}