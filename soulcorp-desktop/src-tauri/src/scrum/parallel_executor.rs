use super::executor::{dependencies_satisfied, truncate_summary, write_deliverable};
use super::tree::{mark_story_done_if_tasks_complete, now_iso, recompute_project_progress};
use super::types::{
    ExecutionRun, ExecutionStatus, WorkNode, WorkNodeKind, WorkNodeStatus,
};
use crate::agent_runtime::detached::{DetachedRuntimeContext, execute_for_task_detached};
use crate::operations;
use crate::state::{AgentRecord, AppState};
use crate::token_budget::charge_tokens;
use rayon::prelude::*;
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

#[derive(Debug, Clone)]
struct ParallelExecutionJob {
    run_id: String,
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
    work_node_id: String,
    agent_id: String,
    outcome: ParallelLlmOutcome,
}

pub struct ParallelBatchReport {
    pub executed: u32,
    pub messages: Vec<String>,
}

pub fn run_detached_parallel_tick(app: &AppHandle) -> Option<ParallelBatchReport> {
    let jobs = {
        let state_mutex = app.state::<Mutex<AppState>>();
        let Ok(mut state) = state_mutex.lock() else {
            return None;
        };
        if !parallel_execution_enabled(&state) {
            return None;
        }
        prepare_parallel_jobs(&mut state, app)?
    };

    if jobs.is_empty() {
        return None;
    }

    let results: Vec<ParallelLlmResult> = jobs
        .par_iter()
        .map(run_parallel_llm)
        .collect();

    let mut report = ParallelBatchReport {
        executed: 0,
        messages: Vec::new(),
    };

    {
        let state_mutex = app.state::<Mutex<AppState>>();
        let Ok(mut state) = state_mutex.lock() else {
            return Some(report);
        };

        for result in results {
            if let Some(message) = apply_parallel_llm_result(&mut state, app, result) {
                report.executed += 1;
                report.messages.push(message);
            }
        }

        operations::sync_agent_visual_state(&mut state);
    }

    if report.executed > 0 || !report.messages.is_empty() {
        Some(report)
    } else {
        None
    }
}

fn parallel_execution_enabled(state: &AppState) -> bool {
    state.settings.scrum_auto_execute
        && !state.settings.scrum_execution_paused
        && state.settings.scrum_parallel_agents
        && !state.company_id.is_empty()
        && crate::token_budget::total_company_tokens(&state.token_economy)
            >= state.settings.scrum_min_tokens_guard
}

fn prepare_parallel_jobs(state: &mut AppState, app: &AppHandle) -> Option<Vec<ParallelExecutionJob>> {
    let busy_agents: HashSet<String> = state
        .work_nodes
        .iter()
        .filter(|n| n.status == WorkNodeStatus::InProgress)
        .filter_map(|n| n.assignee_agent_id.clone())
        .collect();

    let idle_agents: Vec<String> = state
        .agents
        .values()
        .filter(|a| !crate::fate::is_system_agent(a))
        .filter(|a| a.status != "working" && !busy_agents.contains(&a.id))
        .map(|a| a.id.clone())
        .collect();

    let max_parallel = state.settings.scrum_max_executions_per_tick.max(1) as usize;
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
        company_id: state.company_id.clone(),
        workspace_root,
    };

    let mut jobs = Vec::new();
    let mut reserved_agents = busy_agents;

    for agent_id in idle_agents.into_iter().take(max_parallel) {
        if reserved_agents.contains(&agent_id) {
            continue;
        }

        let candidate = state
            .work_nodes
            .iter()
            .filter(|n| {
                n.kind == WorkNodeKind::Task
                    && n.assignee_agent_id.as_deref() == Some(agent_id.as_str())
                    && matches!(n.status, WorkNodeStatus::InSprint | WorkNodeStatus::Ready)
                    && dependencies_satisfied(state, n)
            })
            .max_by(|a, b| a.priority.cmp(&b.priority))
            .cloned();

        let Some(task) = candidate else {
            continue;
        };

        let Some(agent) = state.agents.get(&agent_id).cloned() else {
            continue;
        };
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
            });
            jobs.push(ParallelExecutionJob {
                run_id,
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

fn run_parallel_llm(job: &ParallelExecutionJob) -> ParallelLlmResult {
    if job.throttled {
        return ParallelLlmResult {
            run_id: job.run_id.clone(),
            work_node_id: job.work_node_id.clone(),
            agent_id: job.agent.id.clone(),
            outcome: ParallelLlmOutcome::Throttled {
                message: job.throttle_message.clone(),
            },
        };
    }

    match execute_for_task_detached(&job.runtime, &job.task, &job.agent, &job.project_title) {
        Ok(result) => ParallelLlmResult {
            run_id: job.run_id.clone(),
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
        ParallelLlmOutcome::Throttled { message } => Some(format!(
            "Parallel work execution throttled (tokens) for task {}: {message}",
            result.work_node_id
        )),
        ParallelLlmOutcome::Failed { error } => {
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
                    eprintln!("Parallel execution billing failed: {err}");
                }
            }

            let task = state
                .work_nodes
                .iter()
                .find(|n| n.id == result.work_node_id)
                .cloned()?;
            let agent = state.agents.get(&result.agent_id)?.clone();

            let page_id = match write_deliverable(app, state, &task, &agent, &content) {
                Ok(page_id) => page_id,
                Err(error) => {
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
            if let Some(run) = state
                .execution_runs
                .iter_mut()
                .find(|r| r.id == result.run_id)
            {
                run.status = ExecutionStatus::Succeeded;
                run.provider = provider;
                run.actual_tokens = estimated_tokens;
                run.deliverable_page_id = Some(page_id);
                run.summary = truncate_summary(&content);
                run.finished_at = Some(now_iso());
            }

            let _ = operations::advance_gigs_on_work_delivered(state, estimated_tokens);

            Some(format!(
                "Parallel work execution completed for task {}.",
                result.work_node_id
            ))
        }
    }
}