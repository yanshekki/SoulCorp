use super::executor::{truncate_summary, write_deliverable};
use super::tree::{mark_story_done_if_tasks_complete, now_iso, recompute_project_progress};
use super::types::{
    ExecutionRun, ExecutionStatus, WorkNode, WorkNodeKind, WorkNodeStatus,
};
use crate::agent_activity::{
    emit_deliverable_ready, emit_error, end_session, resolve_brain_labels, start_session,
    ActivityRunContext, ActivitySource, BrainLayer, NewSessionParams, SessionStatus,
};
use crate::agent_runtime::detached::{DetachedRuntimeContext, execute_for_task_detached};
use crate::db::persistence::commit;
use crate::operations;
use crate::state::{AgentRecord, AppState};
use crate::token_budget::charge_tokens;
use std::collections::HashSet;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::lock_util::MutexExt;

/// In-flight background CLI/LLM jobs (true multi-thread, non-blocking worker).
static INFLIGHT_JOBS: AtomicUsize = AtomicUsize::new(0);
const MAX_INFLIGHT_JOBS: usize = 4;
#[derive(Debug, Clone)]
struct ParallelExecutionJob {
    run_id: String,
    session_id: String,
    work_node_id: String,
    agent: AgentRecord,
    task: WorkNode,
    project_title: String,
    estimated_tokens: u64,
    runtime: DetachedRuntimeContext,
    throttled: bool,
    throttle_message: String,
}

#[derive(Debug, Clone)]
enum ParallelLlmOutcome {
    Succeeded {
        content: String,
        provider: String,
        estimated_tokens: u64,
        charge: Option<crate::token_budget::ChargeContext>,
    },
    Failed {
        error: String,
    },
    Throttled {
        message: String,
    },
}

#[derive(Debug, Clone)]
struct ParallelLlmResult {
    run_id: String,
    session_id: String,
    work_node_id: String,
    agent_id: String,
    outcome: ParallelLlmOutcome,
}

pub struct ParallelBatchReport {
    pub executed: u32,
    pub messages: Vec<String>,
}

pub fn run_detached_parallel_tick(app: &AppHandle) -> Option<ParallelBatchReport> {
    let inflight = INFLIGHT_JOBS.load(Ordering::SeqCst);
    if inflight >= MAX_INFLIGHT_JOBS {
        return Some(ParallelBatchReport {
            executed: 0,
            messages: vec![format!(
                "Worker: {inflight} background job(s) still running (max {MAX_INFLIGHT_JOBS})."
            )],
        });
    }

    let slots = MAX_INFLIGHT_JOBS.saturating_sub(inflight);
    let jobs = {
        let state_mutex = app.state::<Mutex<AppState>>();
        let Ok(mut state) = state_mutex.lock_or_recover() else {
            return None;
        };
        if !parallel_execution_enabled(&state) {
            return None;
        }
        // Cap this tick to free slots so we never pile unbounded Grok processes.
        let prev_max = state.settings.scrum_max_executions_per_tick;
        state.settings.scrum_max_executions_per_tick = (slots as u32).max(1).min(prev_max.max(1));
        let prepared = prepare_parallel_jobs(&mut state, app);
        state.settings.scrum_max_executions_per_tick = prev_max;
        prepared?
    };

    if jobs.is_empty() {
        return None;
    }

    let scheduled = jobs.len() as u32;
    for job in jobs {
        INFLIGHT_JOBS.fetch_add(1, Ordering::SeqCst);
        let app = app.clone();
        thread::spawn(move || {
            let result = run_parallel_llm(&app, &job);
            let msg = apply_result_under_lock(&app, result);
            if let Some(message) = msg {
                let _ = app.emit(
                    "scrum-changed",
                    serde_json::json!({ "messages": [message] }),
                );
            }
            INFLIGHT_JOBS.fetch_sub(1, Ordering::SeqCst);
        });
    }

    Some(ParallelBatchReport {
        executed: 0,
        messages: vec![format!(
            "Scheduled {scheduled} background execution job(s) (multi-thread; inflight≈{}).",
            INFLIGHT_JOBS.load(Ordering::SeqCst)
        )],
    })
}

fn parallel_execution_enabled(state: &AppState) -> bool {
    // Always prefer detached execution when auto-execute is on — never hold AppState
    // across LLM/CLI calls (serial path freezes the UI).
    state.settings.scrum_auto_execute
        && !state.settings.scrum_execution_paused
        && !state.company_id.is_empty()
        && crate::ai::auto_work_should_run(&state.settings)
        && crate::token_budget::total_company_tokens(&state.token_economy)
            >= state.settings.scrum_min_tokens_guard
}

fn prepare_parallel_jobs(state: &mut AppState, app: &AppHandle) -> Option<Vec<ParallelExecutionJob>> {
    let max_parallel = state.settings.scrum_max_executions_per_tick.max(1) as usize;
    // One job per free agent from that agent's serial queue head (Kafka partition).
    let candidates = super::queue::pick_parallel_candidates(state, max_parallel);

    let workspace_root = if state.company_id.is_empty() {
        None
    } else {
        app.path()
            .app_data_dir()
            .ok()
            .map(|dir| crate::workspace::company_workspace_root(&dir, &state.company_id))
    };
    let runtime = DetachedRuntimeContext {
        settings: state.settings.clone(),
        hub: state.hub.clone(),
        department_providers: state.department_ai_providers.clone(),
        department_runtimes: state.department_agent_runtimes.clone(),
        company_id: state.company_id.clone(),
        workspace_root,
    };

    let mut jobs = Vec::new();
    let mut reserved_agents = HashSet::new();

    for (agent_id, task_id) in candidates {
        if reserved_agents.contains(&agent_id) {
            continue;
        }

        let Some(task) = state.work_nodes.iter().find(|n| n.id == task_id).cloned() else {
            continue;
        };

        let Some(agent) = state.agents.get(&agent_id).cloned() else {
            continue;
        };
        // Top up leaf wallet before estimate (avoids THROTTLED when company can mint).
        crate::token_budget::fund_agent_for_execution(state, &agent_id, 50_000);
        let Ok(estimate) = super::executor::estimate_execution(state, &task.id) else {
            continue;
        };

        let project_title = state
            .projects
            .iter()
            .find(|p| p.id == task.project_id)
            .map(|p| p.title.clone())
            .unwrap_or_else(|| "Company project".to_string());

        let run_id = format!("exec-{}", Uuid::new_v4());
        let (brain_label, transport) = resolve_brain_labels(state, &agent, BrainLayer::Execution);
        let session_id = start_session(
            state,
            Some(app),
            NewSessionParams {
                agent_id: agent_id.clone(),
                agent_name: agent.name.clone(),
                source: ActivitySource::Execution,
                brain_layer: BrainLayer::Execution,
                brain_label,
                transport,
                work_node_id: Some(task.id.clone()),
                work_node_title: Some(task.title.clone()),
                meeting_id: None,
                run_id: Some(run_id.clone()),
            },
        );

        let (cli_prompt, cli_cmd, cli_prompt_path, ws_info) =
            super::executor::build_execution_cli_bundle(
                state,
                &task,
                &agent,
                &project_title,
                runtime.workspace_root.as_deref(),
            );
        let cli_input = Some(cli_prompt);
        let cli_command = Some(cli_cmd);
        let workspace_info = Some(ws_info);

        if !estimate.affordable {
            state.execution_runs.push(ExecutionRun {
                id: run_id.clone(),
                work_node_id: task.id.clone(),
                agent_id: agent_id.clone(),
                status: ExecutionStatus::Throttled,
                provider: String::new(),
                estimated_tokens: estimate.estimated_tokens,
                actual_tokens: 0,
                deliverable_page_id: None,
                summary: String::new(),
                error: Some(estimate.message.clone()),
                started_at: now_iso(),
                finished_at: Some(now_iso()),
                cli_input,
                cli_command,
                cli_prompt_path,
                workspace_info,
            });
            jobs.push(ParallelExecutionJob {
                run_id,
                session_id,
                work_node_id: task.id.clone(),
                agent,
                task,
                project_title,
                estimated_tokens: estimate.estimated_tokens,
                runtime: runtime.clone(),
                throttled: true,
                throttle_message: estimate.message,
            });
            reserved_agents.insert(agent_id);
            continue;
        }

        state.execution_runs.push(ExecutionRun {
            id: run_id.clone(),
            work_node_id: task.id.clone(),
            agent_id: agent_id.clone(),
            status: ExecutionStatus::Running,
            provider: String::new(),
            estimated_tokens: estimate.estimated_tokens,
            actual_tokens: 0,
            deliverable_page_id: None,
            summary: String::new(),
            error: None,
            started_at: now_iso(),
            finished_at: None,
            cli_input,
            cli_command,
            cli_prompt_path,
            workspace_info,
        });

        if let Some(node) = state.work_nodes.iter_mut().find(|n| n.id == task.id) {
            node.status = WorkNodeStatus::InProgress;
            node.updated_at = now_iso();
        }
        if let Some(agent_mut) = state.agents.get_mut(&agent_id) {
            agent_mut.status = "working".to_string();
        }

        jobs.push(ParallelExecutionJob {
            run_id,
            session_id,
            work_node_id: task.id.clone(),
            agent,
            task,
            project_title,
            estimated_tokens: estimate.estimated_tokens,
            runtime: runtime.clone(),
            throttled: false,
            throttle_message: String::new(),
        });
        reserved_agents.insert(agent_id);
    }

    if jobs.is_empty() {
        None
    } else {
        Some(jobs)
    }
}

fn apply_result_under_lock(app: &AppHandle, result: ParallelLlmResult) -> Option<String> {
    let state_mutex = app.state::<Mutex<AppState>>();
    let mut state = state_mutex.lock_or_recover().ok()?;
    let msg = apply_parallel_llm_result(&mut state, app, result);
    operations::sync_agent_visual_state(&mut state);
    if let Some(message) = msg.as_ref() {
        state.scrum_worker.recent_log.push(message.clone());
        while state.scrum_worker.recent_log.len() > 30 {
            state.scrum_worker.recent_log.remove(0);
        }
    }
    let _ = commit(app.clone(), &state);
    msg
}

fn run_parallel_llm(app: &AppHandle, job: &ParallelExecutionJob) -> ParallelLlmResult {
    if job.throttled {
        return ParallelLlmResult {
            run_id: job.run_id.clone(),
            session_id: job.session_id.clone(),
            work_node_id: job.work_node_id.clone(),
            agent_id: job.agent.id.clone(),
            outcome: ParallelLlmOutcome::Throttled {
                message: job.throttle_message.clone(),
            },
        };
    }

    let activity = ActivityRunContext {
        session_id: job.session_id.clone(),
        app: app.clone(),
    };

    match execute_for_task_detached(
        &job.runtime,
        &job.task,
        &job.agent,
        &job.project_title,
        Some(activity),
    ) {
        Ok(result) => ParallelLlmResult {
            run_id: job.run_id.clone(),
            session_id: job.session_id.clone(),
            work_node_id: job.work_node_id.clone(),
            agent_id: job.agent.id.clone(),
            outcome: ParallelLlmOutcome::Succeeded {
                content: result.content,
                provider: result.provider,
                estimated_tokens: job.estimated_tokens,
                charge: result.charge,
            },
        },
        Err(error) => ParallelLlmResult {
            run_id: job.run_id.clone(),
            session_id: job.session_id.clone(),
            work_node_id: job.work_node_id.clone(),
            agent_id: job.agent.id.clone(),
            outcome: ParallelLlmOutcome::Failed { error },
        },
    }
}

fn apply_parallel_llm_result(
    state: &mut AppState,
    app: &AppHandle,
    result: ParallelLlmResult,
) -> Option<String> {
    match result.outcome {
        ParallelLlmOutcome::Throttled { message } => {
            emit_error(
                state,
                Some(app),
                &result.session_id,
                &result.agent_id,
                &message,
            );
            end_session(
                state,
                Some(app),
                &result.session_id,
                SessionStatus::Failed,
                Some(message.clone()),
            );
            Some(format!(
                "Parallel work execution throttled (tokens) for task {}: {message}",
                result.work_node_id
            ))
        }
        ParallelLlmOutcome::Failed { error } => {
            emit_error(
                state,
                Some(app),
                &result.session_id,
                &result.agent_id,
                &error,
            );
            end_session(
                state,
                Some(app),
                &result.session_id,
                SessionStatus::Failed,
                Some(error.clone()),
            );
            if let Some(node) = state
                .work_nodes
                .iter_mut()
                .find(|n| n.id == result.work_node_id)
            {
                node.status = WorkNodeStatus::Blocked;
                node.updated_at = now_iso();
            }
            if let Some(agent_mut) = state.agents.get_mut(&result.agent_id) {
                agent_mut.status = "idle".to_string();
            }
            if let Some(run) = state
                .execution_runs
                .iter_mut()
                .find(|r| r.id == result.run_id)
            {
                run.status = ExecutionStatus::Failed;
                run.error = Some(error.clone());
                run.finished_at = Some(now_iso());
            }
            Some(format!(
                "Parallel work execution failed for task {}: {error}",
                result.work_node_id
            ))
        }
        ParallelLlmOutcome::Succeeded {
            content,
            provider,
            estimated_tokens,
            charge,
        } => {
            if let Some(charge) = charge {
                if let Err(err) = charge_tokens(state, charge) {
                    crate::app_log::log_global(crate::app_log::LogLevel::Error, crate::app_log::LogCategory::Execution, "parallel_billing", format!("Parallel execution billing failed: {err}"), None);
                }
            }

            let task = state
                .work_nodes
                .iter()
                .find(|n| n.id == result.work_node_id)
                .cloned()?;
            let agent = state.agents.get(&result.agent_id)?.clone();

            let summary = truncate_summary(&content);
            let page_id = match write_deliverable(app, state, &task, &agent, &content) {
                Ok(page_id) => page_id,
                Err(error) => {
                    emit_error(
                        state,
                        Some(app),
                        &result.session_id,
                        &result.agent_id,
                        &error,
                    );
                    end_session(
                        state,
                        Some(app),
                        &result.session_id,
                        SessionStatus::Failed,
                        Some(error.clone()),
                    );
                    if let Some(node) = state
                        .work_nodes
                        .iter_mut()
                        .find(|n| n.id == result.work_node_id)
                    {
                        node.status = WorkNodeStatus::Blocked;
                        node.updated_at = now_iso();
                    }
                    if let Some(agent_mut) = state.agents.get_mut(&result.agent_id) {
                        agent_mut.status = "idle".to_string();
                    }
                    if let Some(run) = state
                        .execution_runs
                        .iter_mut()
                        .find(|r| r.id == result.run_id)
                    {
                        run.status = ExecutionStatus::Failed;
                        run.error = Some(error.clone());
                        run.finished_at = Some(now_iso());
                    }
                    return Some(format!(
                        "Parallel work execution failed for task {}: {error}",
                        result.work_node_id
                    ));
                }
            };

            if let Some(node) = state
                .work_nodes
                .iter_mut()
                .find(|n| n.id == result.work_node_id)
            {
                node.status = WorkNodeStatus::InReview;
                node.linked_workspace_page_id = Some(page_id.clone());
                node.updated_at = now_iso();
            }

            let parent_id = task.parent_id.clone();
            let project_id = task.project_id.clone();
            if let Some(story_id) = parent_id {
                mark_story_done_if_tasks_complete(&mut state.work_nodes, &story_id);
            }
            let nodes_snapshot = state.work_nodes.clone();
            recompute_project_progress(&mut state.projects, &nodes_snapshot, &project_id);

            if let Some(agent_mut) = state.agents.get_mut(&result.agent_id) {
                agent_mut.status = "idle".to_string();
            }
            emit_deliverable_ready(
                state,
                Some(app),
                &result.session_id,
                &result.agent_id,
                &page_id,
                &summary,
            );
            end_session(
                state,
                Some(app),
                &result.session_id,
                SessionStatus::Completed,
                Some(summary.clone()),
            );

            if let Some(run) = state
                .execution_runs
                .iter_mut()
                .find(|r| r.id == result.run_id)
            {
                run.status = ExecutionStatus::Succeeded;
                run.provider = provider;
                run.actual_tokens = estimated_tokens;
                run.deliverable_page_id = Some(page_id);
                run.summary = summary.clone();
                run.finished_at = Some(now_iso());
            }

            if let Ok(dir) = app.path().app_data_dir() {
                if !state.company_id.is_empty() {
                    let root = crate::workspace::company_workspace_root(&dir, &state.company_id);
                    if let Ok(storage) = crate::workspace::WorkspaceStorage::new(root) {
                        let _ = storage.ensure_seed();
                        crate::workspace::agent_memory::after_task_success(
                            state,
                            &storage,
                            &agent,
                            &task.title,
                            &summary,
                        );
                    }
                }
            }

            let _ = operations::advance_gigs_on_work_delivered(state, estimated_tokens);

            Some(format!(
                "Parallel work execution completed for task {}.",
                result.work_node_id
            ))
        }
    }
}