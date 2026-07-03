use super::executor::{
    apply_parallel_execution_tick, apply_scrum_execution_tick, retry_blocked_tasks,
    update_directive_lifecycle,
};
use super::org::{resolve_project_for_directive, seed_default_org_links};
use super::pm_review::apply_pm_auto_review_tick;
use super::scheduler::{ensure_active_sprint, plan_sprint};
use super::types::DirectiveStatus;
use super::{route_directive_llm, route_directive_rule_based};
use crate::db::persistence::commit;
use crate::state::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager};

static WORKER_RUNNING: AtomicBool = AtomicBool::new(false);

pub struct WorkerTickReport {
    pub routed: u32,
    pub planned: u32,
    pub executed: u32,
    pub approved: u32,
    pub retried: u32,
    pub messages: Vec<String>,
}

pub fn apply_scrum_worker_tick(state: &mut AppState, app: &AppHandle) -> WorkerTickReport {
    let mut report = WorkerTickReport {
        routed: 0,
        planned: 0,
        executed: 0,
        approved: 0,
        retried: 0,
        messages: Vec::new(),
    };

    if !state.settings.scrum_worker_enabled
        || state.settings.scrum_execution_paused
        || state.company_id.is_empty()
    {
        return report;
    }

    seed_default_org_links(state);

    if state.settings.scrum_auto_route {
        let open_directives: Vec<_> = state
            .directives
            .iter()
            .filter(|d| d.status == DirectiveStatus::Open)
            .cloned()
            .collect();

        for directive in open_directives {
            let Some(project_id) = resolve_project_for_directive(state, &directive) else {
                continue;
            };
            let directive_id = directive.id.clone();
            let use_llm = !state.settings.pure_local_mode && state.settings.ai_provider != "mock";

            let result = if use_llm {
                route_directive_llm(state, &directive_id, &project_id)
            } else {
                route_directive_rule_based(state, &directive_id, &project_id)
            };

            match result {
                Ok(_) => {
                    report.routed += 1;
                    report.messages.push(format!("Auto-routed directive {directive_id}."));
                }
                Err(err) => report.messages.push(format!("Route failed {directive_id}: {err}")),
            }
        }
    }

    if state.settings.scrum_auto_schedule {
        for project in state.projects.clone() {
            if let Ok(sprint_id) = ensure_active_sprint(state, &project.id) {
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

    if state.settings.scrum_auto_execute {
        let max_runs = if state.settings.scrum_parallel_agents {
            state.settings.scrum_max_executions_per_tick.max(1)
        } else {
            1
        };

        for _ in 0..max_runs {
            let note = if state.settings.scrum_parallel_agents {
                apply_parallel_execution_tick(state, app)
            } else {
                apply_scrum_execution_tick(state, app)
            };
            if let Some(note) = note {
                report.executed += 1;
                report.messages.push(note);
            } else {
                break;
            }
        }
    }

    if let Some(review) = apply_pm_auto_review_tick(state, app) {
        report.approved = review.approved;
        report.messages.extend(review.messages);
    }

    update_directive_lifecycle(state);
    report
}

pub fn spawn_scrum_worker(app: AppHandle) {
    if WORKER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    thread::spawn(move || loop {
        let interval_secs = {
            let state_mutex = app.state::<Mutex<AppState>>();
            let state = state_mutex.lock().ok();
            state
                .map(|s| s.settings.scrum_worker_interval_secs.max(5))
                .unwrap_or(30)
        };

        thread::sleep(Duration::from_secs(interval_secs as u64));

        let enabled = {
            let state_mutex = app.state::<Mutex<AppState>>();
            let Ok(state) = state_mutex.lock() else {
                continue;
            };
            state.settings.scrum_worker_enabled && !state.company_id.is_empty()
        };

        if !enabled {
            continue;
        }

        let report = {
            let state_mutex = app.state::<Mutex<AppState>>();
            let Ok(mut state) = state_mutex.lock() else {
                continue;
            };
            apply_scrum_worker_tick(&mut state, &app)
        };

        let changed = report.routed > 0
            || report.planned > 0
            || report.executed > 0
            || report.approved > 0
            || report.retried > 0;

        if changed {
            if let Ok(state) = app.state::<Mutex<AppState>>().lock() {
                let _ = commit(app.clone(), &state);
            }
        }
    });
}