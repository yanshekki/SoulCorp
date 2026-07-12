use super::executor::{
    apply_scrum_execution_tick, retry_blocked_tasks, update_directive_lifecycle,
};
use super::parallel_executor::run_detached_parallel_tick;
use super::org::{resolve_project_for_directive, seed_default_org_links};
use super::pm_review::apply_pm_auto_review_unlocked;
use super::scheduler::{
    advance_sprint_lifecycle, apply_department_head_delegation, ensure_active_sprint, plan_sprint,
};
use super::types::DirectiveStatus;
use super::{route_directive_llm, route_directive_rule_based};
use crate::app_log::{self, LogCategory};
use crate::db::persistence::commit;
use crate::gigs::{
    flush_pending_hub_gig_ops, try_auto_accept_hub_gigs, try_auto_complete_gigs,
    try_auto_hub_pull,
};
use crate::operations::try_auto_submit_gig_qc;
use crate::orchestrator::apply_orchestrator_tick;
use crate::state::AppState;
use chrono::Utc;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::lock_util::MutexExt;
static WORKER_RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize)]
pub struct WorkerTickReport {
    pub routed: u32,
    pub planned: u32,
    pub executed: u32,
    pub approved: u32,
    pub retried: u32,
    pub orchestrated: u32,
    pub meetings: u32,
    pub delegated: u32,
    pub sprints_advanced: u32,
    pub gigs_submitted: u32,
    pub gigs_accepted: u32,
    pub gigs_completed: u32,
    pub hub_qc_flushed: u32,
    pub hub_pulled: bool,
    pub messages: Vec<String>,
    pub timestamp: String,
}

pub fn apply_scrum_worker_tick(
    state: &mut AppState,
    app: &AppHandle,
    force_orchestrator: bool,
) -> WorkerTickReport {
    let mut report = WorkerTickReport {
        routed: 0,
        planned: 0,
        executed: 0,
        approved: 0,
        retried: 0,
        orchestrated: 0,
        meetings: 0,
        delegated: 0,
        sprints_advanced: 0,
        gigs_submitted: 0,
        gigs_accepted: 0,
        gigs_completed: 0,
        hub_qc_flushed: 0,
        hub_pulled: false,
        messages: Vec::new(),
        timestamp: Utc::now().to_rfc3339(),
    };

    if state.company_id.is_empty() {
        push_worker_log(state, app, &["Worker tick skipped: no active company.".into()]);
        return report;
    }
    if !state.settings.scrum_worker_enabled {
        push_worker_log(state, app, &["Worker tick skipped: scrum worker disabled.".into()]);
        return report;
    }
    if state.settings.scrum_execution_paused {
        push_worker_log(state, app, &["Worker tick skipped: execution paused.".into()]);
        return report;
    }
    // Gate only LLM *execution* — still route/schedule/assign so work does not stall
    // forever while a key is missing (or readiness was miscomputed).
    let llm_ready = crate::ai::auto_work_should_run(&state.settings);
    if !llm_ready {
        let provider = crate::ai::configured_meeting_provider(&state.settings);
        report.messages.push(format!(
            "Worker: LLM execution paused until API key is set for '{provider}' — still scheduling/assigning tasks."
        ));
    }

    let pool = crate::token_budget::total_company_tokens(&state.token_economy);
    if pool < state.settings.scrum_min_tokens_guard {
        let msg = format!(
            "Worker alert: token pool ({pool}) below guard {} — auto-execution may skip.",
            state.settings.scrum_min_tokens_guard
        );
        report.messages.push(msg.clone());
        push_worker_log(state, app, &[msg]);
    }
    if state.token_economy.company_starved {
        let msg = "Finance alert: company starved — agents may be throttled.".to_string();
        report.messages.push(msg.clone());
        push_worker_log(state, app, &[msg]);
    }

    seed_default_org_links(state);
    let _ = crate::scrum::queue::backfill_missing_queued_at(state);

    let force = force_orchestrator
        || state.autopilot.stall_tick_count >= crate::autopilot::STALL_TICK_THRESHOLD;
    let orchestrator = apply_orchestrator_tick(state, app, force);
    report.orchestrated = orchestrator.directives_issued;
    report.meetings = orchestrator.meetings_triggered;
    report.messages.extend(orchestrator.messages);

    let sprints_advanced = advance_sprint_lifecycle(state);
    report.sprints_advanced = sprints_advanced;
    if sprints_advanced > 0 {
        report
            .messages
            .push(format!("Advanced {sprints_advanced} sprint cycle(s)."));
    }

    if state.settings.scrum_auto_route {
        let open_directives: Vec<_> = state
            .directives
            .iter()
            .filter(|d| d.status == DirectiveStatus::Open)
            .cloned()
            .collect();

        for directive in open_directives {
            if directive.awaiting_ceo_gate {
                continue;
            }
            let Some(project_id) = resolve_project_for_directive(state, &directive) else {
                continue;
            };
            let directive_id = directive.id.clone();
            // NEVER call route_directive_llm under AppState lock — freezes the UI for
            // the whole HTTP round-trip. Rule-based here; LLM routing can be re-added
            // unlocked after this tick if needed.
            let result = route_directive_rule_based(state, &directive_id, &project_id);

            match result {
                Ok(_) => {
                    report.routed += 1;
                    report.messages.push(format!("Auto-routed directive {directive_id}."));
                    let briefs = crate::autopilot::ensure_story_brief_pages(state, app);
                    if briefs > 0 {
                        report.messages.push(format!("Created {briefs} story brief page(s)."));
                    }
                }
                Err(err) => {
                    let msg = format!("Route failed {directive_id}: {err}");
                    app_log::log_error(app, LogCategory::Worker, "scrum_worker_route", &msg);
                    report.messages.push(msg);
                }
            }
        }
    }

    if report.routed == 0 {
        let briefs = crate::autopilot::ensure_story_brief_pages(state, app);
        if briefs > 0 {
            report.messages.push(format!("Created {briefs} story brief page(s)."));
        }
    }

    if state.settings.scrum_auto_schedule {
        for project in state.projects.clone() {
            if let Ok(sprint_id) = ensure_active_sprint(state, &project.id) {
                let delegated = apply_department_head_delegation(state);
                if delegated > 0 {
                    report.delegated += delegated;
                    report
                        .messages
                        .push(format!("Department heads delegated {delegated} task(s)."));
                }
                if let Ok(assigned) = plan_sprint(state, &sprint_id) {
                    if assigned > 0 {
                        report.planned += assigned;
                        report
                            .messages
                            .push(format!("Planned {assigned} tasks for {}.", project.title));
                    }
                }
            }
        }
    }

    if state.settings.scrum_auto_retry_blocked {
        let retried = retry_blocked_tasks(state);
        report.retried = retried;
        if retried > 0 {
            report
                .messages
                .push(format!("Requeued {retried} blocked task(s)."));
        }
    }

    // Never run serial execute or long LLM reviews under this lock —
    // run_detached_parallel_tick + apply_pm_auto_review_unlocked handle those off-lock.
    let _ = llm_ready;

    let hub_flush = flush_pending_hub_gig_ops(state);
    report.hub_qc_flushed = hub_flush.qc_submitted;
    if hub_flush.qc_submitted > 0 {
        report.messages.push(format!(
            "Flushed {} pending hub QC submission(s).",
            hub_flush.qc_submitted
        ));
    }
    for failure in hub_flush.failures {
        report.messages.push(failure);
    }

    let hub_pull = try_auto_hub_pull(state);
    report.hub_pulled = hub_pull.pulled;
    report.messages.extend(hub_pull.messages);

    let auto_gigs = try_auto_accept_hub_gigs(state);
    report.gigs_accepted = auto_gigs.accepted;
    report.messages.extend(auto_gigs.messages);

    let gigs_submitted = try_auto_submit_gig_qc(state);
    report.gigs_submitted = gigs_submitted;
    if gigs_submitted > 0 {
        report
            .messages
            .push(format!("Auto-submitted {gigs_submitted} gig(s) for QC."));
    }

    let auto_complete = try_auto_complete_gigs(state);
    report.gigs_completed = auto_complete.completed;
    report.messages.extend(auto_complete.messages);

    let recruit = crate::operations::try_auto_recruit_tick(state);
    report.messages.extend(recruit.messages);

    update_directive_lifecycle(state);
    crate::operations::sync_agent_visual_state(state);
    push_worker_log(state, app, &report.messages);
    state.scrum_worker.last_tick_at = Some(report.timestamp.clone());
    crate::autopilot::after_worker_tick(state, app, &report, force_orchestrator);
    report
}

fn push_worker_log(state: &mut AppState, app: &AppHandle, messages: &[String]) {
    for msg in messages {
        state.scrum_worker.recent_log.push(msg.clone());
        crate::agent_activity::emit_worker_message(state, Some(app), msg);
    }
    while state.scrum_worker.recent_log.len() > 30 {
        state.scrum_worker.recent_log.remove(0);
    }
}

pub fn spawn_scrum_worker(app: AppHandle) {
    if WORKER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    thread::spawn(move || {
        // Give the UI time to bootstrap before any auto-execution / Grok CLI spawn.
        // Immediate first-tick parallel runs were freezing the desktop on open.
        thread::sleep(Duration::from_secs(20));
        let mut ticks: u64 = 0;
        loop {
            if ticks > 0 {
                let interval_secs = {
                    let state_mutex = app.state::<Mutex<AppState>>();
                    state_mutex
                        .lock_or_recover()
                        .ok()
                        .map(|s| s.settings.scrum_worker_interval_secs.max(5))
                        .unwrap_or(30)
                };
                thread::sleep(Duration::from_secs(interval_secs as u64));
            }
            ticks = ticks.saturating_add(1);

            let enabled = {
                let state_mutex = app.state::<Mutex<AppState>>();
                let Ok(state) = state_mutex.lock_or_recover() else {
                    continue;
                };
                state.settings.scrum_worker_enabled && !state.company_id.is_empty()
            };

            if !enabled {
                continue;
            }

            let mut report = {
                let state_mutex = app.state::<Mutex<AppState>>();
                let Ok(mut state) = state_mutex.lock_or_recover() else {
                    continue;
                };
                apply_scrum_worker_tick(&mut state, &app, false)
            };

            // Skip CLI/LLM execution on the first worker tick after boot.
            // Always release AppState before any network / LLM work.
            if ticks >= 2 {
                if let Some(parallel) = run_detached_parallel_tick(&app) {
                    report.executed += parallel.executed;
                    report.messages.extend(parallel.messages);
                }
                // PM review under its own short locks (never across LLM HTTP).
                if let Some(review) = apply_pm_auto_review_unlocked(&app) {
                    report.approved += review.approved;
                    report.messages.extend(review.messages);
                }
            }

            let changed = report.routed > 0
                || report.planned > 0
                || report.executed > 0
                || report.approved > 0
                || report.retried > 0
                || report.orchestrated > 0
                || report.meetings > 0
                || report.delegated > 0
                || report.sprints_advanced > 0
                || report.gigs_submitted > 0
                || report.gigs_accepted > 0
                || report.gigs_completed > 0
                || report.hub_qc_flushed > 0
                || report.hub_pulled
                || !report.messages.is_empty();

            if changed {
                for msg in &report.messages {
                    let lower = msg.to_ascii_lowercase();
                    if lower.contains("fail") || lower.contains("error") || lower.contains("timeout")
                    {
                        app_log::log_warn(&app, LogCategory::Worker, "scrum_worker_tick", msg);
                    }
                }
                let _ = app.emit("scrum-changed", &report);
            }
            // Always persist last_tick_at so UI/debug show the worker is alive.
            if let Ok(state) = app.state::<Mutex<AppState>>().lock_or_recover() {
                if let Err(err) = commit(app.clone(), &state) {
                    app_log::log_error(
                        &app,
                        LogCategory::Worker,
                        "scrum_worker_commit",
                        format!("Worker commit failed: {err}"),
                    );
                }
            }
        }
    });
}