use crate::agent_activity::{
    emit_deliverable_ready, emit_error, end_session, resolve_brain_labels, start_session,
    ActivityRunContext, ActivitySource, BrainLayer, NewSessionParams, SessionStatus,
};
use crate::agent_runtime::execute_for_task;
use super::org::resolve_pm_agent_id;
use super::tree::{mark_story_done_if_tasks_complete, now_iso, recompute_project_progress};
use super::types::{
    DirectiveStatus, ExecutionRun, ExecutionStatus, WorkNode, WorkNodeKind, WorkNodeStatus,
};
use crate::ai::provider::ChatRequest;
use crate::ai::{self, BilledChatRequest};
use crate::ai::token_estimate;
use crate::soul::build_chat_parts_for_agent;
use crate::state::AppState;
use crate::workspace::{
    agent_service::{AgentContext, AgentWorkspaceService},
    storage::{company_workspace_root, WorkspaceStorage},
};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

pub struct WorkExecutionEstimate {
    pub estimated_tokens: u64,
    pub affordable: bool,
    pub message: String,
}

pub fn estimate_execution(state: &AppState, work_node_id: &str) -> Result<WorkExecutionEstimate, String> {
    let task = state
        .work_nodes
        .iter()
        .find(|n| n.id == work_node_id)
        .ok_or_else(|| "Work item not found.".to_string())?;
    if task.kind != WorkNodeKind::Task {
        return Err("Only tasks can be executed.".to_string());
    }
    let agent_id = task
        .assignee_agent_id
        .clone()
        .ok_or_else(|| "Assign an agent before executing.".to_string())?;
    let agent = state
        .agents
        .get(&agent_id)
        .ok_or_else(|| "Assignee not found.".to_string())?;

    let request = build_execution_request(state, task, agent)?;
    let estimate = token_estimate::estimate_request(&request) as u64;
    let affordable = crate::token_budget::can_afford(state, &agent_id, estimate as u32).is_ok();
    Ok(WorkExecutionEstimate {
        estimated_tokens: estimate,
        affordable,
        message: if affordable {
            format!("Execution will use about {estimate} tokens.")
        } else {
            "Insufficient token budget for this execution.".to_string()
        },
    })
}

pub fn execute_task(
    state: &mut AppState,
    app: &AppHandle,
    work_node_id: &str,
) -> Result<ExecutionRun, String> {
    super::queue::assert_can_execute_now(state, work_node_id)?;

    let (task, agent_id) = {
        let task = state
            .work_nodes
            .iter()
            .find(|n| n.id == work_node_id)
            .cloned()
            .ok_or_else(|| "Work item not found.".to_string())?;
        if task.kind != WorkNodeKind::Task {
            return Err("Only tasks can be executed.".to_string());
        }
        if matches!(task.status, WorkNodeStatus::Done | WorkNodeStatus::InReview) {
            return Err("Task is already completed or awaiting review.".to_string());
        }
        let agent_id = task
            .assignee_agent_id
            .clone()
            .ok_or_else(|| "Assign an agent before executing.".to_string())?;
        (task, agent_id)
    };

    let agent = state
        .agents
        .get(&agent_id)
        .cloned()
        .ok_or_else(|| "Assignee not found.".to_string())?;

    let estimate = estimate_execution(state, work_node_id)?;
    if !estimate.affordable {
        let run = ExecutionRun {
            id: format!("exec-{}", Uuid::new_v4()),
            work_node_id: work_node_id.to_string(),
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
        };
        state.execution_runs.push(run.clone());
        return Ok(run);
    }

    let run_id = format!("exec-{}", Uuid::new_v4());
    state.execution_runs.push(ExecutionRun {
        id: run_id.clone(),
        work_node_id: work_node_id.to_string(),
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

    if let Some(node) = state.work_nodes.iter_mut().find(|n| n.id == work_node_id) {
        node.status = WorkNodeStatus::InProgress;
        node.updated_at = now_iso();
    }
    if let Some(agent_mut) = state.agents.get_mut(&agent_id) {
        agent_mut.status = "working".to_string();
    }

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
            work_node_id: Some(work_node_id.to_string()),
            work_node_title: Some(task.title.clone()),
            meeting_id: None,
            run_id: Some(run_id.clone()),
        },
    );
    let activity = ActivityRunContext {
        session_id: session_id.clone(),
        app: app.clone(),
    };

    let project_title = state
        .projects
        .iter()
        .find(|p| p.id == task.project_id)
        .map(|p| p.title.clone())
        .unwrap_or_else(|| "Company project".to_string());

    let workspace_root = if state.company_id.is_empty() {
        None
    } else {
        app.path()
            .app_data_dir()
            .ok()
            .map(|dir| company_workspace_root(&dir, &state.company_id))
    };

    let response_content = execute_for_task(
        state,
        &task,
        &agent,
        &project_title,
        workspace_root.clone(),
        Some(activity),
    );

    let result = match response_content {
        Ok(content) => {
            let page_id = write_deliverable(app, state, &task, &agent, &content)?;
            let summary = truncate_summary(&content);
            emit_deliverable_ready(
                state,
                Some(app),
                &session_id,
                &agent_id,
                &page_id,
                &summary,
            );
            end_session(
                state,
                Some(app),
                &session_id,
                SessionStatus::Completed,
                Some(summary.clone()),
            );
            let tokens = estimate.estimated_tokens;
            let gate_deliverable = crate::autopilot::gates_deliverables(state);
            if let Some(node) = state.work_nodes.iter_mut().find(|n| n.id == work_node_id) {
                node.status = WorkNodeStatus::InReview;
                node.linked_workspace_page_id = Some(page_id.clone());
                node.awaiting_ceo_gate = gate_deliverable;
                node.updated_at = now_iso();
            }
            let parent_id = task.parent_id.clone();
            let project_id = task.project_id.clone();
            if let Some(story_id) = parent_id {
                mark_story_done_if_tasks_complete(&mut state.work_nodes, &story_id);
            }
            let nodes_snapshot = state.work_nodes.clone();
            recompute_project_progress(&mut state.projects, &nodes_snapshot, &project_id);
            if let Some(agent_mut) = state.agents.get_mut(&agent_id) {
                agent_mut.status = "idle".to_string();
            }
            if let Some(run) = state.execution_runs.iter_mut().find(|r| r.id == run_id) {
                run.status = ExecutionStatus::Succeeded;
                run.provider = if state.settings.scrum_use_agent_tools {
                    "agent-tools".to_string()
                } else {
                    "llm".to_string()
                };
                run.actual_tokens = tokens;
                run.deliverable_page_id = Some(page_id);
                run.summary = summary.clone();
                run.finished_at = Some(now_iso());
            }
            // Working memory: append + maybe compress (per-agent memory.md)
            if let Some(root) = workspace_root.as_ref() {
                if let Ok(storage) = WorkspaceStorage::new(root.clone()) {
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
            state
                .execution_runs
                .iter()
                .find(|r| r.id == run_id)
                .cloned()
                .ok_or_else(|| "Execution run missing.".to_string())
        }
        Err(error) => {
            emit_error(state, Some(app), &session_id, &agent_id, &error);
            end_session(
                state,
                Some(app),
                &session_id,
                SessionStatus::Failed,
                Some(error.clone()),
            );
            if let Some(node) = state.work_nodes.iter_mut().find(|n| n.id == work_node_id) {
                node.status = WorkNodeStatus::Blocked;
                node.updated_at = now_iso();
            }
            if let Some(agent_mut) = state.agents.get_mut(&agent_id) {
                agent_mut.status = "idle".to_string();
            }
            if let Some(run) = state.execution_runs.iter_mut().find(|r| r.id == run_id) {
                run.status = ExecutionStatus::Failed;
                run.error = Some(error.clone());
                run.finished_at = Some(now_iso());
            }
            Err(error)
        }
    };

    result
}

pub fn build_execution_request_for_project(
    task: &WorkNode,
    agent: &crate::state::AgentRecord,
    project_title: &str,
) -> Result<ChatRequest, String> {
    let ac = if task.acceptance_criteria.is_empty() {
        "Meet the task objective with clear, actionable output.".to_string()
    } else {
        task.acceptance_criteria.join("\n- ")
    };

    let task_context = format!(
        "Project: {project_title}\nTask: {}\nDetails: {}\nAcceptance criteria:\n- {}",
        task.title, task.description, ac
    );
    let (persona, context) = build_chat_parts_for_agent(
        agent.soul.as_ref(),
        &agent.name,
        &agent.role,
        &agent.department,
        &task_context,
    );
    let user_prompt = format!(
        "You are executing a work task for project '{project_title}'.\n\nTask: {}\nDetails: {}\n\nAcceptance criteria:\n- {}\n\nProduce a concise deliverable: summary, key decisions, and next steps. Write in markdown-friendly plain text.",
        task.title, task.description, ac
    );

    Ok(ChatRequest {
        system_prompt: persona,
        context: Some(context),
        user_prompt,
        temperature: 0.55,
        soul_id: agent.soul_id,
        conversation_turns: Vec::new(),
    })
}

pub(crate) fn build_execution_request(
    state: &AppState,
    task: &WorkNode,
    agent: &crate::state::AgentRecord,
) -> Result<ChatRequest, String> {
    let project = state
        .projects
        .iter()
        .find(|p| p.id == task.project_id)
        .map(|p| p.title.clone())
        .unwrap_or_else(|| "Company project".to_string());
    build_execution_request_for_project(task, agent, &project)
}

pub(crate) fn write_deliverable(
    app: &AppHandle,
    state: &AppState,
    task: &WorkNode,
    agent: &crate::state::AgentRecord,
    content: &str,
) -> Result<String, String> {
    if state.company_id.is_empty() {
        return Err("Company not loaded.".to_string());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = WorkspaceStorage::new(company_workspace_root(&dir, &state.company_id))?;
    storage.ensure_seed()?;
    let service = AgentWorkspaceService::new(&storage);
    let agent_ctx = AgentContext::from_record(agent);
    let page_title = format!("Deliverable — {}", task.title);
    let page = service.write_deliverable(&agent_ctx, &page_title, content)?;
    Ok(page.id)
}

pub(crate) fn truncate_summary(content: &str) -> String {
    let trimmed = content.trim();
    if trimmed.chars().count() <= 240 {
        trimmed.to_string()
    } else {
        format!("{}…", trimmed.chars().take(240).collect::<String>())
    }
}

pub fn apply_scrum_execution_tick(state: &mut AppState, app: &AppHandle) -> Option<String> {
    if !state.settings.scrum_auto_execute || state.settings.scrum_execution_paused {
        return None;
    }

    if crate::token_budget::total_company_tokens(&state.token_economy)
        < state.settings.scrum_min_tokens_guard
    {
        return None;
    }

    // Per-agent serial queue: fair pick of oldest queue head among free agents.
    let candidate = super::queue::pick_serial_candidate(state)?;

    match execute_task(state, app, &candidate) {
        Ok(run) => Some(format!(
            "Work execution {} for task {}.",
            match run.status {
                ExecutionStatus::Succeeded => "completed",
                ExecutionStatus::Throttled => "throttled (tokens)",
                _ => "finished",
            },
            run.work_node_id
        )),
        Err(err) => Some(format!("Work execution failed: {err}")),
    }
}

pub fn retry_blocked_tasks(state: &mut AppState) -> u32 {
    let max_retries = state.settings.scrum_max_blocked_retries.max(1);
    let mut count = 0u32;
    for node in state.work_nodes.iter_mut() {
        if node.status != WorkNodeStatus::Blocked {
            continue;
        }
        if node.retry_count >= max_retries {
            continue;
        }
        node.status = WorkNodeStatus::Ready;
        node.retry_count = node.retry_count.saturating_add(1);
        node.updated_at = now_iso();
        count += 1;
    }
    count
}

pub fn update_directive_lifecycle(state: &mut AppState) {
    let directive_ids: Vec<String> = state
        .directives
        .iter()
        .filter(|d| {
            matches!(
                d.status,
                DirectiveStatus::Routed | DirectiveStatus::Executing
            )
        })
        .map(|d| d.id.clone())
        .collect();

    for directive_id in directive_ids {
        let Some(directive) = state.directives.iter().find(|d| d.id == directive_id).cloned() else {
            continue;
        };
        if directive.spawned_node_ids.is_empty() {
            continue;
        }

        let nodes: Vec<_> = state
            .work_nodes
            .iter()
            .filter(|n| directive.spawned_node_ids.contains(&n.id))
            .collect();

        let tasks: Vec<_> = nodes
            .iter()
            .flat_map(|story| {
                state
                    .work_nodes
                    .iter()
                    .filter(|n| n.parent_id.as_deref() == Some(story.id.as_str()))
                    .collect::<Vec<_>>()
            })
            .chain(nodes.iter().filter(|n| n.kind == WorkNodeKind::Task).copied())
            .collect();

        let task_nodes: Vec<_> = if tasks.is_empty() {
            nodes
                .iter()
                .filter(|n| n.kind == WorkNodeKind::Task)
                .copied()
                .collect()
        } else {
            tasks
        };

        if task_nodes.is_empty() {
            continue;
        }

        let all_done = task_nodes
            .iter()
            .all(|n| n.status == WorkNodeStatus::Done);
        let any_active = task_nodes.iter().any(|n| {
            matches!(
                n.status,
                WorkNodeStatus::InProgress
                    | WorkNodeStatus::InReview
                    | WorkNodeStatus::InSprint
                    | WorkNodeStatus::Ready
            )
        });

        if let Some(directive) = state.directives.iter_mut().find(|d| d.id == directive_id) {
            if all_done {
                directive.status = DirectiveStatus::Done;
            } else if any_active {
                directive.status = DirectiveStatus::Executing;
            }
        }
    }
}

pub(crate) fn dependencies_satisfied(state: &AppState, node: &WorkNode) -> bool {
    node.depends_on.iter().all(|dep_id| {
        state
            .work_nodes
            .iter()
            .find(|n| n.id == *dep_id)
            .is_some_and(|n| n.status == WorkNodeStatus::Done)
    })
}

pub fn route_directive_llm(
    state: &mut AppState,
    directive_id: &str,
    project_id: &str,
) -> Result<Vec<WorkNode>, String> {
    // Fallback to rule-based when no PM / LLM unavailable
    let pm_id = resolve_pm_agent_id(state, Some(project_id));
    let directive = state
        .directives
        .iter()
        .find(|d| d.id == directive_id)
        .cloned()
        .ok_or_else(|| "Directive not found.".to_string())?;

    if pm_id.is_none() || state.settings.pure_local_mode {
        return super::scheduler::route_directive_rule_based(state, directive_id, project_id);
    }

    let pm_agent_id = pm_id.clone().unwrap();
    let pm = state
        .agents
        .get(&pm_agent_id)
        .cloned()
        .ok_or_else(|| "PM agent not found.".to_string())?;

    let team_skills: Vec<String> = state
        .agents
        .values()
        .filter(|a| !crate::fate::is_system_agent(a))
        .flat_map(|a| a.skills.clone())
        .collect();

    let departments: Vec<String> = state
        .agents
        .values()
        .filter(|a| !crate::fate::is_system_agent(a))
        .map(|a| a.department.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    let prompt = format!(
        "Break down this CEO directive into 1-2 stories with 3-6 tasks as JSON array.\nDirective: {}\nDetails: {}\nTeam skills: {}\nDepartments: {}\n\nUse cross-department tasks when needed. Order tasks so later items depend on earlier ones.\nEach story MUST include acceptance_criteria (array of at least 2 measurable strings). Each task SHOULD include acceptance_criteria when applicable.\nReturn ONLY JSON like [{{\"kind\":\"story\",\"title\":\"...\",\"points\":5,\"department\":\"Engineering\",\"acceptance_criteria\":[\"Criterion 1\",\"Criterion 2\"],\"tasks\":[{{\"title\":\"...\",\"points\":2,\"department\":\"Engineering\",\"acceptance_criteria\":[\"Task criterion\"]}}]}}]",
        directive.title,
        directive.description,
        team_skills.join(", "),
        departments.join(", ")
    );

    let (persona, ctx) = build_chat_parts_for_agent(
        pm.soul.as_ref(),
        &pm.name,
        &pm.role,
        &pm.department,
        "PM planning and backlog decomposition",
    );
    let request = ChatRequest {
        system_prompt: persona,
        context: Some(ctx),
        user_prompt: prompt,
        temperature: 0.4,
        soul_id: pm.soul_id,
        conversation_turns: Vec::new(),
    };

    let dept_providers = state.department_ai_providers.clone();
    let billed = BilledChatRequest {
        request,
        agent_id: pm_agent_id.clone(),
        department: pm.department.clone(),
        source: "directive_decompose".to_string(),
    };

    match ai::chat_with_fallback_billed(
        state,
        billed,
        &dept_providers,
        pm.ai_provider.as_deref(),
    ) {
        Ok(resp) => parse_llm_decomposition(state, directive_id, project_id, &pm_agent_id, &resp.content),
        Err(_) => super::scheduler::route_directive_rule_based(state, directive_id, project_id),
    }
}

fn parse_llm_decomposition(
    state: &mut AppState,
    directive_id: &str,
    project_id: &str,
    pm_id: &str,
    content: &str,
) -> Result<Vec<WorkNode>, String> {
    #[derive(serde::Deserialize)]
    struct LlmTask {
        title: String,
        #[serde(default)]
        points: u8,
        #[serde(default)]
        department: String,
        #[serde(default)]
        acceptance_criteria: Vec<String>,
    }
    #[derive(serde::Deserialize)]
    struct LlmStory {
        title: String,
        #[serde(default)]
        points: u8,
        #[serde(default)]
        department: String,
        #[serde(default)]
        acceptance_criteria: Vec<String>,
        #[serde(default)]
        tasks: Vec<LlmTask>,
    }

    let json_start = content.find('[').unwrap_or(0);
    let json_end = content.rfind(']').map(|i| i + 1).unwrap_or(content.len());
    let slice = &content[json_start..json_end];

    let stories: Vec<LlmStory> = serde_json::from_str(slice).unwrap_or_default();
    if stories.is_empty() {
        return super::scheduler::route_directive_rule_based(state, directive_id, project_id);
    }

    let project_dept = state
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .map(|p| p.owner_department.clone())
        .unwrap_or_else(|| "Engineering".to_string());

    let mut created = Vec::new();
    let now = now_iso();
    let story_rank = super::tree::next_backlog_rank(&state.work_nodes, project_id, None);

    for (story_index, story) in stories.into_iter().take(2).enumerate() {
        let story_id = super::tree::new_node_id();
        let dept = if story.department.is_empty() {
            project_dept.clone()
        } else {
            story.department.clone()
        };
        let story_criteria = if story.acceptance_criteria.len() >= 2 {
            story.acceptance_criteria.clone()
        } else {
            vec![
                "Deliverable meets story objective.".to_string(),
                "Acceptance criteria reviewed by PM.".to_string(),
            ]
        };
        let story_node = WorkNode {
            id: story_id.clone(),
            parent_id: None,
            project_id: project_id.to_string(),
            kind: WorkNodeKind::Story,
            title: story.title,
            description: String::new(),
            status: WorkNodeStatus::Ready,
            priority: 4,
            story_points: story.points.max(1),
            backlog_rank: story_rank + story_index as u32,
            assignee_agent_id: None,
            assigned_by_manager_id: None,
            owner_pm_agent_id: Some(pm_id.to_string()),
            retry_count: 0,
            department: dept.clone(),
            sprint_id: None,
            depends_on: Vec::new(),
            acceptance_criteria: story_criteria,
            linked_workspace_page_id: None,
            linked_gig_contract_id: None,
            awaiting_ceo_gate: false,
            created_at: now.clone(),
            updated_at: now.clone(),
            completed_at: None,
            queued_at: None,
        };
        created.push(story_node.clone());
        state.work_nodes.push(story_node);

        let mut previous_task_id: Option<String> = None;
        for (task_index, task) in story.tasks.into_iter().take(6).enumerate() {
            let task_id = super::tree::new_node_id();
            let depends_on = previous_task_id.clone().into_iter().collect::<Vec<_>>();
            let task_criteria = if task.acceptance_criteria.is_empty() {
                vec!["Complete and publish deliverable.".to_string()]
            } else {
                task.acceptance_criteria.clone()
            };
            let task_node = WorkNode {
                id: task_id.clone(),
                parent_id: Some(story_id.clone()),
                project_id: project_id.to_string(),
                kind: WorkNodeKind::Task,
                title: task.title,
                description: String::new(),
                status: WorkNodeStatus::Backlog,
                priority: 4,
                story_points: task.points.max(1),
                backlog_rank: task_index as u32,
                assignee_agent_id: None,
                assigned_by_manager_id: None,
                owner_pm_agent_id: Some(pm_id.to_string()),
                retry_count: 0,
                department: if task.department.is_empty() {
                    dept.clone()
                } else {
                    task.department.clone()
                },
                sprint_id: None,
                depends_on,
                acceptance_criteria: task_criteria,
                linked_workspace_page_id: None,
                linked_gig_contract_id: None,
                awaiting_ceo_gate: false,
                created_at: now.clone(),
                updated_at: now.clone(),
                completed_at: None,
                queued_at: None,
            };
            created.push(task_node.clone());
            state.work_nodes.push(task_node);
            previous_task_id = Some(task_id);
        }
    }

    if let Some(directive) = state.directives.iter_mut().find(|d| d.id == directive_id) {
        directive.status = super::types::DirectiveStatus::Routed;
        directive.spawned_node_ids = created.iter().map(|n| n.id.clone()).collect();
    }

    Ok(created)
}