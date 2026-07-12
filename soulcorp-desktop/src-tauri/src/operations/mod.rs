pub mod auto_recruit;
pub mod automation_readiness;

pub use auto_recruit::try_auto_recruit_tick;
pub use automation_readiness::{compute_automation_readiness, AutomationReadiness};

use crate::config;
use crate::gigs::hub_sync::{blocking_submit_gig_qc, enqueue_gig_qc_submit, hub_client_from_state};
use crate::gigs::{compute_qc_score, submit_contract_for_qc_at_index};
use crate::lock_util::MutexExt;
use crate::scrum::executor::apply_scrum_execution_tick;
use crate::scrum::types::{ExecutionStatus, WorkNodeKind, WorkNodeStatus};
use crate::state::AppState;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// v1 work platform: no simulation calendar — reset stale game day/tick on load.
pub fn normalize_v1_operational_state(state: &mut AppState) {
    if !config::is_v1() {
        return;
    }
    state.day_number = 1;
    state.tick = 0;
}

/// Clear zombie in-progress execution left from a killed/crashed session so the next
/// boot does not immediately re-spawn a multi-minute Grok CLI and freeze the UI.
pub fn recover_stale_execution_on_boot(state: &mut AppState) {
    let now = crate::scrum::tree::now_iso();
    let mut cleared_runs = 0u32;
    for run in state.execution_runs.iter_mut() {
        if matches!(run.status, ExecutionStatus::Running | ExecutionStatus::Queued) {
            run.status = ExecutionStatus::Failed;
            run.error = Some(
                "Interrupted by app restart — re-queue the task to run again.".into(),
            );
            run.finished_at = Some(now.clone());
            cleared_runs += 1;
        }
    }
    let mut reset_tasks = 0u32;
    for node in state.work_nodes.iter_mut() {
        if node.kind != WorkNodeKind::Task {
            continue;
        }
        if matches!(node.status, WorkNodeStatus::InProgress) {
            // Put back on the queue so worker can pick it after the boot grace period.
            node.status = WorkNodeStatus::InSprint;
            node.updated_at = now.clone();
            reset_tasks += 1;
        }
    }
    for agent in state.agents.values_mut() {
        if agent.status == "working" || agent.status == "meeting" {
            agent.status = "idle".to_string();
        }
    }
    if cleared_runs > 0 || reset_tasks > 0 {
        state.scrum_worker.recent_log.push(format!(
            "Boot recovery: cleared {cleared_runs} stuck run(s), reset {reset_tasks} in-progress task(s)."
        ));
        while state.scrum_worker.recent_log.len() > 30 {
            state.scrum_worker.recent_log.remove(0);
        }
    }
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
///
/// Must **not** be called while the caller holds `AppState` — each tick takes its own short locks
/// and runs LLM/CLI unlocked.
pub fn try_scrum_auto_execute_after_work(app: &AppHandle) -> Option<String> {
    let (worker_on, auto, paused, max_runs) = {
        let state_mutex = app.state::<Mutex<AppState>>();
        let Ok(state) = state_mutex.lock_or_recover() else {
            return None;
        };
        (
            state.settings.scrum_worker_enabled,
            state.settings.scrum_auto_execute,
            state.settings.scrum_execution_paused,
            state.settings.scrum_max_executions_per_tick.max(1),
        )
    };
    if config::is_v2() || worker_on {
        return None;
    }
    if !auto || paused {
        return None;
    }

    let mut notes = Vec::new();
    for _ in 0..max_runs {
        match apply_scrum_execution_tick(app) {
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

/// Auto-submit in-progress gigs that are QC-ready (v1 operational path).
pub fn try_auto_submit_gig_qc(state: &mut AppState) -> u32 {
    let mut submitted = 0u32;
    let indices: Vec<usize> = state
        .gig_contracts
        .iter()
        .enumerate()
        .filter(|(_, contract)| contract.status == "in_progress")
        .filter_map(|(index, contract)| {
            gig_ready_for_qc(state, contract).ok().map(|_| index)
        })
        .collect();

    for index in indices {
        let (gig_id, contract_id, qc_score) = {
            let contract = &state.gig_contracts[index];
            (
                contract.gig_id,
                contract.contract_id.clone(),
                compute_qc_score(state, contract),
            )
        };

        if !state.settings.pure_local_mode && !state.hub.base_url.trim().is_empty() {
            let client = hub_client_from_state(state);
            if let Err(err) = blocking_submit_gig_qc(&client, gig_id, qc_score, None) {
                enqueue_gig_qc_submit(state, gig_id, qc_score, &contract_id, None);
                crate::app_log::log_global(crate::app_log::LogLevel::Warn, crate::app_log::LogCategory::Hub, "hub_qc_queue", format!("Hub QC queued for gig {gig_id}: {err}"), None);
            }
        }

        submit_contract_for_qc_at_index(state, index);
        submitted += 1;
    }
    submitted
}

/// Keep agent status aligned with active scrum work for UI / v2 office visuals.
pub fn sync_agent_visual_state(state: &mut AppState) {
    let busy: std::collections::HashSet<String> = state
        .work_nodes
        .iter()
        .filter(|n| n.status == WorkNodeStatus::InProgress)
        .filter_map(|n| n.assignee_agent_id.clone())
        .collect();

    let in_review: std::collections::HashSet<String> = state
        .work_nodes
        .iter()
        .filter(|n| n.kind == WorkNodeKind::Task && n.status == WorkNodeStatus::InReview)
        .filter_map(|n| n.assignee_agent_id.clone())
        .collect();

    for agent in state.agents.values_mut() {
        if crate::fate::is_system_agent(agent) {
            continue;
        }
        if agent.status == "meeting" {
            continue;
        }
        if busy.contains(&agent.id) {
            agent.status = "working".to_string();
        } else if in_review.contains(&agent.id) {
            agent.status = "reviewing".to_string();
        } else if agent.status == "working" || agent.status == "reviewing" {
            agent.status = "idle".to_string();
        }
    }
}