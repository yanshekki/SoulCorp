use crate::db::persistence::commit;
use crate::scrum::{
    agent_inboxes, board_snapshot, build_overview, build_work_tree, ensure_active_sprint,
    estimate_execution, execute_task, issue_co_ceo_directive, new_node_id,
    now_iso, plan_sprint, preview_route_directive, route_directive_llm, route_directive_rule_based,
    validate_depends_on_dag, validate_parent_child, CommandCenterOverview, DirectivePreviewNode,
    ExecutionRun, ScrumBoardSnapshot, Sprint, SprintStatus, WorkNode, WorkNodeKind, WorkNodeStatus,
    WorkTreeSnapshot,
};
use crate::scrum::{
    AgentInboxEntry, Directive, DirectiveSource, DirectiveStatus, DirectiveTarget,
};
use crate::state::{AppState, InternalProject};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::lock_util::MutexExt;
struct ScrumSnapshotCache {
    company_id: String,
    project_id: Option<String>,
    fingerprint: u64,
    snapshot: ScrumSnapshot,
}

fn scrum_cache_slot() -> &'static Mutex<Option<ScrumSnapshotCache>> {
    static SLOT: OnceLock<Mutex<Option<ScrumSnapshotCache>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

fn scrum_state_fingerprint(state: &AppState, project_id: Option<&str>) -> u64 {
    let mut hasher = DefaultHasher::new();
    state.company_id.hash(&mut hasher);
    state.tick.hash(&mut hasher);
    state.projects.len().hash(&mut hasher);
    state.work_nodes.len().hash(&mut hasher);
    state.directives.len().hash(&mut hasher);
    state.execution_runs.len().hash(&mut hasher);
    project_id.hash(&mut hasher);
    hasher.finish()
}

fn build_scrum_snapshot(state: &AppState, project_id: Option<String>) -> ScrumSnapshot {
    let pid = project_id.or_else(|| state.projects.first().map(|p| p.id.clone()));
    ScrumSnapshot {
        projects: state.projects.clone(),
        tree: pid.as_ref().map(|id| build_work_tree(id, &state.work_nodes)),
        board: pid.as_ref().map(|id| board_snapshot(&state, id)),
        directives: state.directives.clone(),
        inboxes: agent_inboxes(&state),
        execution_runs: state.execution_runs.clone(),
        default_pm_agent_id: state.default_pm_agent_id.clone(),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProjectRequest {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub owner_department: String,
    #[serde(default)]
    pub priority: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProjectRequest {
    pub project_id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub owner_department: Option<String>,
    pub priority: Option<u8>,
    pub pm_agent_id: Option<String>,
    pub default_cycle_days: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorkNodeRequest {
    pub project_id: String,
    pub parent_id: Option<String>,
    pub kind: WorkNodeKind,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub department: String,
    #[serde(default)]
    pub story_points: u8,
    #[serde(default)]
    pub priority: u8,
    #[serde(default)]
    pub acceptance_criteria: Vec<String>,
    #[serde(default)]
    pub depends_on: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateWorkNodeRequest {
    pub node_id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<WorkNodeStatus>,
    pub priority: Option<u8>,
    pub story_points: Option<u8>,
    pub department: Option<String>,
    pub assignee_agent_id: Option<Option<String>>,
    pub sprint_id: Option<Option<String>>,
    #[serde(default)]
    pub depends_on: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignWorkNodeRequest {
    pub node_id: String,
    pub agent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueDirectiveRequest {
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub target: DirectiveTarget,
    pub target_ref: String,
    #[serde(default)]
    pub source: Option<DirectiveSource>,
    #[serde(default)]
    pub priority: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteDirectiveRequest {
    pub directive_id: String,
    pub project_id: String,
    #[serde(default)]
    pub use_llm: bool,
    #[serde(default)]
    pub plan_sprint_after: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewRouteDirectiveRequest {
    pub directive_id: String,
    pub project_id: String,
    #[serde(default)]
    pub use_llm: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateDirectiveStatusRequest {
    pub directive_id: String,
    pub status: DirectiveStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendCoCeoDirectiveToStateRequest {
    pub title: String,
    pub description: String,
    pub target_department: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchExecutionResult {
    pub attempted: u32,
    pub succeeded: u32,
    pub failed: u32,
    pub messages: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSprintRequest {
    pub project_id: String,
    pub name: String,
    #[serde(default)]
    pub goal: String,
    #[serde(default)]
    pub velocity_target: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrumSnapshot {
    pub projects: Vec<InternalProject>,
    pub tree: Option<WorkTreeSnapshot>,
    pub board: Option<ScrumBoardSnapshot>,
    pub directives: Vec<Directive>,
    pub inboxes: Vec<AgentInboxEntry>,
    pub execution_runs: Vec<ExecutionRun>,
    pub default_pm_agent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkExecutionCostEstimate {
    pub estimated_tokens: u64,
    pub affordable: bool,
    pub message: String,
}

#[tauri::command]
pub fn list_projects(state: State<'_, Mutex<AppState>>) -> Result<Vec<InternalProject>, String> {
    let state = state.lock_or_recover()?;
    Ok(state.projects.clone())
}

#[tauri::command]
pub fn create_project(
    request: CreateProjectRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<InternalProject, String> {
    let mut state = state.lock_or_recover()?;
    if request.title.trim().len() < 2 {
        return Err("Project title must be at least 2 characters.".to_string());
    }
    let project = InternalProject {
        id: format!("proj-{}", Uuid::new_v4()),
        title: request.title.trim().to_string(),
        progress: 0.0,
        priority: request.priority.max(1),
        owner_department: if request.owner_department.is_empty() {
            "Engineering".to_string()
        } else {
            request.owner_department
        },
        description: request.description,
        pm_agent_id: state.default_pm_agent_id.clone(),
        active_sprint_id: None,
        default_cycle_days: 14,
    };
    state.projects.push(project.clone());
    commit(app, &state)?;
    Ok(project)
}

#[tauri::command]
pub fn update_project(
    request: UpdateProjectRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<InternalProject, String> {
    let mut state = state.lock_or_recover()?;
    let project = state
        .projects
        .iter_mut()
        .find(|p| p.id == request.project_id)
        .ok_or_else(|| "Project not found.".to_string())?;
    if let Some(title) = request.title {
        project.title = title;
    }
    if let Some(desc) = request.description {
        project.description = desc;
    }
    if let Some(dept) = request.owner_department {
        project.owner_department = dept;
    }
    if let Some(priority) = request.priority {
        project.priority = priority;
    }
    if let Some(pm) = request.pm_agent_id {
        project.pm_agent_id = Some(pm);
    }
    if let Some(days) = request.default_cycle_days {
        project.default_cycle_days = days.max(1);
    }
    let snapshot = project.clone();
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn get_scrum_snapshot(
    project_id: Option<String>,
    state: State<'_, Mutex<AppState>>,
    _app: AppHandle,
) -> Result<ScrumSnapshot, String> {
    let state = state.lock_or_recover()?;
    let fingerprint = scrum_state_fingerprint(&state, project_id.as_deref());
    if let Ok(guard) = scrum_cache_slot().lock() {
        if let Some(entry) = guard.as_ref() {
            if entry.company_id == state.company_id
                && entry.project_id == project_id
                && entry.fingerprint == fingerprint
            {
                return Ok(entry.snapshot.clone());
            }
        }
    }

    let snapshot = build_scrum_snapshot(&state, project_id.clone());
    if let Ok(mut guard) = scrum_cache_slot().lock() {
        *guard = Some(ScrumSnapshotCache {
            company_id: state.company_id.clone(),
            project_id,
            fingerprint,
            snapshot: snapshot.clone(),
        });
    }
    Ok(snapshot)
}

#[tauri::command]
pub fn get_work_tree(
    project_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkTreeSnapshot, String> {
    let state = state.lock_or_recover()?;
    Ok(build_work_tree(&project_id, &state.work_nodes))
}

#[tauri::command]
pub fn create_work_node(
    request: CreateWorkNodeRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<WorkNode, String> {
    let mut state = state.lock_or_recover()?;
    if !state.projects.iter().any(|p| p.id == request.project_id) {
        return Err("Project not found.".to_string());
    }
    let parent_kind = if let Some(parent_id) = &request.parent_id {
        let parent = state
            .work_nodes
            .iter()
            .find(|n| n.id == *parent_id)
            .ok_or_else(|| "Parent node not found.".to_string())?;
        if !validate_parent_child(parent.kind, request.kind) {
            return Err("Invalid parent/child node kind.".to_string());
        }
        Some(parent.kind)
    } else {
        if !matches!(request.kind, WorkNodeKind::Program | WorkNodeKind::Epic | WorkNodeKind::Story) {
            return Err("Root nodes must be program, epic, or story.".to_string());
        }
        None
    };
    let _ = parent_kind;
    validate_depends_on_dag(&state.work_nodes, "new", &request.depends_on)?;

    let dept = if request.department.is_empty() {
        state
            .projects
            .iter()
            .find(|p| p.id == request.project_id)
            .map(|p| p.owner_department.clone())
            .unwrap_or_else(|| "Engineering".to_string())
    } else {
        request.department
    };

    let project_id = request.project_id.clone();
    let parent_id = request.parent_id.clone();
    let now = now_iso();
    let node = WorkNode {
        id: new_node_id(),
        parent_id: parent_id.clone(),
        project_id: project_id.clone(),
        kind: request.kind,
        title: request.title.trim().to_string(),
        description: request.description,
        status: WorkNodeStatus::Backlog,
        priority: request.priority.max(1),
        story_points: request.story_points,
        backlog_rank: crate::scrum::tree::next_backlog_rank(
            &state.work_nodes,
            &project_id,
            parent_id.as_deref(),
        ),
        assignee_agent_id: None,
        assigned_by_manager_id: None,
        owner_pm_agent_id: state.default_pm_agent_id.clone(),
        retry_count: 0,
        department: dept,
        sprint_id: None,
        depends_on: request.depends_on,
        acceptance_criteria: request.acceptance_criteria,
        linked_workspace_page_id: None,
        linked_gig_contract_id: None,
        awaiting_ceo_gate: false,
        created_at: now.clone(),
        updated_at: now,
        completed_at: None,
        queued_at: None,
    };
    state.work_nodes.push(node.clone());
    commit(app, &state)?;
    Ok(node)
}

#[tauri::command]
pub fn update_work_node(
    request: UpdateWorkNodeRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<WorkNode, String> {
    let mut state = state.lock_or_recover()?;
    if let Some(deps) = &request.depends_on {
        validate_depends_on_dag(&state.work_nodes, &request.node_id, deps)?;
    }
    // Validate assignee before taking a mutable work-node borrow.
    if let Some(Some(agent_id)) = request.assignee_agent_id.as_ref() {
        if !state.agents.contains_key(agent_id) {
            return Err("Agent not found.".to_string());
        }
    }
    let node = state
        .work_nodes
        .iter_mut()
        .find(|n| n.id == request.node_id)
        .ok_or_else(|| "Work node not found.".to_string())?;
    if let Some(title) = request.title {
        node.title = title;
    }
    if let Some(desc) = request.description {
        node.description = desc;
    }
    if let Some(status) = request.status {
        node.status = status;
        if status == WorkNodeStatus::Done {
            node.completed_at = Some(now_iso());
        }
    }
    if let Some(priority) = request.priority {
        node.priority = priority;
    }
    if let Some(points) = request.story_points {
        node.story_points = points;
    }
    if let Some(dept) = request.department {
        node.department = dept;
    }
    if let Some(assignee) = request.assignee_agent_id {
        match assignee {
            Some(agent_id) => {
                // Same serial-queue path as assign_work_node (Kafka partition enqueue).
                crate::scrum::queue::assign_and_enqueue(node, agent_id);
                if node.status == WorkNodeStatus::Backlog {
                    node.status = WorkNodeStatus::Ready;
                }
            }
            None => {
                node.assignee_agent_id = None;
                node.queued_at = None;
            }
        }
    }
    if let Some(sprint_id) = request.sprint_id {
        node.sprint_id = sprint_id;
    }
    if let Some(deps) = request.depends_on {
        node.depends_on = deps;
    }
    node.updated_at = now_iso();
    let snapshot = node.clone();
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn assign_work_node(
    request: AssignWorkNodeRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<WorkNode, String> {
    let mut state = state.lock_or_recover()?;
    if let Some(agent_id) = &request.agent_id {
        if !state.agents.contains_key(agent_id) {
            return Err("Agent not found.".to_string());
        }
    }
    let node = state
        .work_nodes
        .iter_mut()
        .find(|n| n.id == request.node_id)
        .ok_or_else(|| "Work node not found.".to_string())?;
    let has_assignee = request.agent_id.is_some();
    if let Some(agent_id) = request.agent_id {
        crate::scrum::queue::assign_and_enqueue(node, agent_id);
    } else {
        node.assignee_agent_id = None;
        node.queued_at = None;
        node.updated_at = crate::scrum::now_iso();
    }
    if has_assignee && node.status == WorkNodeStatus::Backlog {
        node.status = WorkNodeStatus::Ready;
    }
    let snapshot = node.clone();
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn issue_directive(
    request: IssueDirectiveRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<Directive, String> {
    let mut state = state.lock_or_recover()?;
    if request.title.trim().len() < 2 {
        return Err("Directive title must be at least 2 characters.".to_string());
    }
    let directive = Directive {
        id: format!("dir-{}", Uuid::new_v4()),
        title: request.title.trim().to_string(),
        description: request.description,
        source: request.source.unwrap_or(DirectiveSource::Ceo),
        target: request.target,
        target_ref: request.target_ref,
        status: DirectiveStatus::Open,
        spawned_node_ids: Vec::new(),
        awaiting_ceo_gate: false,
        ceo_comment: String::new(),
        created_at: now_iso(),
    };
    state.directives.push(directive.clone());
    let _priority = request.priority;
    commit(app, &state)?;
    Ok(directive)
}

#[tauri::command]
pub fn list_directives(state: State<'_, Mutex<AppState>>) -> Result<Vec<Directive>, String> {
    let state = state.lock_or_recover()?;
    Ok(state.directives.clone())
}

#[tauri::command]
pub fn route_directive(
    request: RouteDirectiveRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<Vec<WorkNode>, String> {
    let mut state = state.lock_or_recover()?;
    let created = if request.use_llm {
        route_directive_llm(&mut state, &request.directive_id, &request.project_id)?
    } else {
        route_directive_rule_based(&mut state, &request.directive_id, &request.project_id)?
    };
    if let Some(directive) = state.directives.iter_mut().find(|d| d.id == request.directive_id) {
        directive.status = DirectiveStatus::Routed;
    }
    if request.plan_sprint_after || state.settings.scrum_auto_schedule {
        if let Ok(sprint_id) = ensure_active_sprint(&mut state, &request.project_id) {
            let _ = plan_sprint(&mut state, &sprint_id);
        }
    }
    commit(app, &state)?;
    Ok(created)
}

#[tauri::command]
pub fn create_sprint(
    request: CreateSprintRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<Sprint, String> {
    let mut state = state.lock_or_recover()?;
    let cycle = state
        .projects
        .iter()
        .find(|p| p.id == request.project_id)
        .map(|p| p.default_cycle_days)
        .unwrap_or(14);
    let start = state.day_number;
    let sprint = Sprint {
        id: format!("sprint-{}", Uuid::new_v4()),
        project_id: request.project_id.clone(),
        name: request.name,
        goal: request.goal,
        cycle_length_days: cycle,
        start_day: start,
        end_day: start.saturating_add(cycle),
        status: SprintStatus::Planning,
        committed_story_ids: Vec::new(),
        velocity_target: request.velocity_target.max(1),
        started_at: None,
    };
    let sprint_id = sprint.id.clone();
    state.sprints.push(sprint.clone());
    if let Some(project) = state.projects.iter_mut().find(|p| p.id == request.project_id) {
        project.active_sprint_id = Some(sprint_id);
    }
    commit(app, &state)?;
    Ok(sprint)
}

#[tauri::command]
pub fn start_sprint(
    sprint_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<Sprint, String> {
    let mut state = state.lock_or_recover()?;
    let sprint = state
        .sprints
        .iter_mut()
        .find(|s| s.id == sprint_id)
        .ok_or_else(|| "Sprint not found.".to_string())?;
    sprint.status = SprintStatus::Active;
    if sprint.started_at.is_none() {
        sprint.started_at = Some(now_iso());
    }
    let snapshot = sprint.clone();
    if state.settings.scrum_auto_schedule {
        let _ = plan_sprint(&mut state, &sprint_id);
    }
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn close_sprint(
    sprint_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<Sprint, String> {
    let mut state = state.lock_or_recover()?;
    let sprint = state
        .sprints
        .iter_mut()
        .find(|s| s.id == sprint_id)
        .ok_or_else(|| "Sprint not found.".to_string())?;
    sprint.status = SprintStatus::Closed;
    let project_id = sprint.project_id.clone();
    let snapshot = sprint.clone();
    if let Some(project) = state.projects.iter_mut().find(|p| p.id == project_id) {
        project.active_sprint_id = None;
    }
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn plan_sprint_cmd(
    sprint_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<u32, String> {
    let mut state = state.lock_or_recover()?;
    let assigned = plan_sprint(&mut state, &sprint_id)?;
    commit(app, &state)?;
    Ok(assigned)
}

#[tauri::command]
pub fn set_default_pm_agent(
    agent_id: Option<String>,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<Option<String>, String> {
    let mut state = state.lock_or_recover()?;
    if let Some(id) = &agent_id {
        if !state.agents.contains_key(id) {
            return Err("Agent not found.".to_string());
        }
    }
    state.default_pm_agent_id = agent_id.clone();
    commit(app, &state)?;
    Ok(agent_id)
}

#[tauri::command]
pub fn estimate_work_execution_cost(
    work_node_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkExecutionCostEstimate, String> {
    let state = state.lock_or_recover()?;
    let estimate = estimate_execution(&state, &work_node_id)?;
    Ok(WorkExecutionCostEstimate {
        estimated_tokens: estimate.estimated_tokens,
        affordable: estimate.affordable,
        message: estimate.message,
    })
}

#[tauri::command]
pub fn run_work_execution(
    work_node_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<ExecutionRun, String> {
    use crate::app_log::{LogCategory, LogErr};
    let result = (|| {
        // Never hold AppState across LLM/CLI — that freezes the whole desktop.
        let run = execute_task(&app, &work_node_id)?;
        if run.status == crate::scrum::ExecutionStatus::Succeeded {
            {
                let mut locked = state.lock_or_recover()?;
                let _ =
                    crate::operations::advance_gigs_on_work_delivered(&mut locked, run.actual_tokens);
                commit(app.clone(), &locked)?;
            }
            // Unlocked follow-on executes (own short locks).
            let _ = crate::operations::try_scrum_auto_execute_after_work(&app);
        }
        Ok(run)
    })();
    result.log_err(&app, LogCategory::Execution, "run_work_execution")
}

#[tauri::command]
pub fn approve_deliverable(
    work_node_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<WorkNode, String> {
    let snapshot = {
        let mut state = state.lock_or_recover()?;
        crate::scrum::approve_deliverable_core(&mut state, &work_node_id)?;
        let snapshot = state
            .work_nodes
            .iter()
            .find(|n| n.id == work_node_id)
            .cloned()
            .ok_or_else(|| "Work node not found.".to_string())?;
        crate::scrum::update_directive_lifecycle(&mut state);
        commit(app.clone(), &state)?;
        snapshot
    };
    // Unlocked — must not hold AppState across auto-execute LLM/CLI.
    let _ = crate::operations::try_scrum_auto_execute_after_work(&app);
    Ok(snapshot)
}

#[tauri::command]
pub fn get_execution_run(
    app: AppHandle,
    run_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<ExecutionRun, String> {
    let mut state = state.lock_or_recover()?;
    ensure_cli_input_on_run(&mut state, &app, &run_id)?;
    state
        .execution_runs
        .iter()
        .find(|r| r.id == run_id)
        .cloned()
        .ok_or_else(|| "Execution run not found.".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionCliView {
    pub run_id: String,
    pub command: String,
    pub prompt: String,
    #[serde(default)]
    pub prompt_path: Option<String>,
    #[serde(default)]
    pub workspace: Option<crate::scrum::types::ExecutionWorkspaceInfo>,
}

/// Returns command line + prompt + workspace paths for a run (rebuilds if not stored / stale).
#[tauri::command]
pub fn get_execution_cli_input(
    app: AppHandle,
    run_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<ExecutionCliView, String> {
    let mut state = state.lock_or_recover()?;
    ensure_cli_input_on_run(&mut state, &app, &run_id)?;
    let run = state
        .execution_runs
        .iter()
        .find(|r| r.id == run_id)
        .ok_or_else(|| "Execution run not found.".to_string())?;
    let prompt = run
        .cli_input
        .clone()
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| {
            "Could not rebuild CLI input — task or agent for this run is missing.".to_string()
        })?;
    let command = run
        .cli_command
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            "# Command not stored for this run — prompt body only.\n# Re-run after upgrade to capture full argv.".into()
        });
    Ok(ExecutionCliView {
        run_id: run_id.clone(),
        command,
        prompt,
        prompt_path: run.cli_prompt_path.clone(),
        workspace: run.workspace_info.clone(),
    })
}

/// True when a stored `cli_command` is a pre-fix / intermediate fake shell line
/// (e.g. `cd … && XAI_API_KEY=*** (set) \ grok -w … -p 1 --prompt-file /tmp/…`)
/// rather than the real headless argv we spawn today.
fn cli_command_is_stale(cmd: &str) -> bool {
    let s = cmd.trim();
    if s.is_empty() {
        return true;
    }
    // Pre-fix wildcard / env placeholders
    if s.contains("*/prompt.md")
        || s.contains("--prompt-file *")
        || s.contains("$PROMPT_FILE")
        || s.contains("XAI_API_KEY=***")
        || s.contains("# notes:")
    {
        return true;
    }
    // Intermediate fake shell wrapper: `cd … && XAI_API_KEY=… \`
    if s.contains("cd ") && s.contains(" && ") && s.contains("XAI_API_KEY=") {
        return true;
    }
    // Old `-p <body>` style without modern file delivery
    if (s.contains(" -p ") || s.contains(" -p\\") || s.contains("\n-p "))
        && !s.contains("--prompt-file")
        && !s.contains("--message-file")
    {
        return true;
    }
    // Old short `-w` without real headless flags (`--cwd` / `--no-auto-update`)
    if s.contains(" -w ") && !s.contains("--cwd") && !s.contains("--no-auto-update") {
        return true;
    }
    // Shell one-liner without current metadata block
    if s.starts_with("cd ") && !s.contains("# --- metadata") {
        return true;
    }
    false
}

fn cli_prompt_path_is_stale(path: &str) -> bool {
    let s = path.trim();
    if s.is_empty() {
        return true;
    }
    // Intermediate NamedTempFile-style path without prompt.md
    if s.contains("soulcorp-cli-prompt-") && !s.ends_with("prompt.md") {
        return true;
    }
    // Wildcard / placeholder
    if s.contains('*') || s == "(prompt-file path unavailable)" {
        return true;
    }
    false
}

fn ensure_cli_input_on_run(
    state: &mut AppState,
    app: &AppHandle,
    run_id: &str,
) -> Result<(), String> {
    let Some(index) = state.execution_runs.iter().position(|r| r.id == run_id) else {
        return Err("Execution run not found.".to_string());
    };
    let needs_prompt = state.execution_runs[index]
        .cli_input
        .as_ref()
        .map(|s| s.trim().is_empty())
        .unwrap_or(true);
    let needs_command = state.execution_runs[index]
        .cli_command
        .as_ref()
        .map(|s| cli_command_is_stale(s))
        .unwrap_or(true);
    let needs_path = state.execution_runs[index]
        .cli_prompt_path
        .as_ref()
        .map(|s| cli_prompt_path_is_stale(s))
        .unwrap_or(true);
    // When command is rebuilt, always refresh path so --prompt-file matches the kept file.
    let needs_path = needs_path || needs_command;
    let needs_ws = state.execution_runs[index].workspace_info.is_none();
    if !needs_prompt && !needs_command && !needs_path && !needs_ws {
        return Ok(());
    }
    let run = state.execution_runs[index].clone();
    if let Some((prompt, command, prompt_path, workspace)) =
        reconstruct_cli_bundle(state, app, &run)
    {
        if needs_prompt {
            state.execution_runs[index].cli_input = Some(prompt);
        }
        if needs_command {
            state.execution_runs[index].cli_command = Some(command);
        }
        if needs_path {
            state.execution_runs[index].cli_prompt_path = prompt_path;
        }
        if needs_ws {
            state.execution_runs[index].workspace_info = Some(workspace);
        }
        let _ = commit(app.clone(), state);
    }
    Ok(())
}

fn reconstruct_cli_bundle(
    state: &AppState,
    app: &AppHandle,
    run: &ExecutionRun,
) -> Option<(
    String,
    String,
    Option<String>,
    crate::scrum::types::ExecutionWorkspaceInfo,
)> {
    let task = state.work_nodes.iter().find(|n| n.id == run.work_node_id)?;
    let agent = state.agents.get(&run.agent_id)?;
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
            .map(|dir| crate::workspace::company_workspace_root(&dir, &state.company_id))
    };
    Some(crate::scrum::executor::build_execution_cli_bundle(
        state,
        task,
        agent,
        &project_title,
        workspace_root.as_deref(),
    ))
}

#[tauri::command]
pub fn list_execution_runs(state: State<'_, Mutex<AppState>>) -> Result<Vec<ExecutionRun>, String> {
    let state = state.lock_or_recover()?;
    Ok(state.execution_runs.clone())
}

#[tauri::command]
pub fn get_command_center_overview(
    project_id: Option<String>,
    state: State<'_, Mutex<AppState>>,
) -> Result<CommandCenterOverview, String> {
    let state = state.lock_or_recover()?;
    Ok(build_overview(&state, project_id.as_deref()))
}

#[tauri::command]
pub fn preview_route_directive_cmd(
    request: PreviewRouteDirectiveRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<DirectivePreviewNode>, String> {
    let state = state.lock_or_recover()?;
    preview_route_directive(
        &state,
        &request.directive_id,
        &request.project_id,
        request.use_llm,
    )
}

#[tauri::command]
pub fn cancel_directive(
    directive_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<Directive, String> {
    let mut state = state.lock_or_recover()?;
    let directive = state
        .directives
        .iter_mut()
        .find(|d| d.id == directive_id)
        .ok_or_else(|| "Directive not found.".to_string())?;
    directive.status = DirectiveStatus::Cancelled;
    let snapshot = directive.clone();
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn update_directive_status(
    request: UpdateDirectiveStatusRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<Directive, String> {
    let mut state = state.lock_or_recover()?;
    let directive = state
        .directives
        .iter_mut()
        .find(|d| d.id == request.directive_id)
        .ok_or_else(|| "Directive not found.".to_string())?;
    directive.status = request.status;
    let snapshot = directive.clone();
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn send_co_ceo_directive_to_state(
    request: SendCoCeoDirectiveToStateRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<Directive, String> {
    let mut state = state.lock_or_recover()?;
    let directive = issue_co_ceo_directive(
        &mut state,
        &request.title,
        &request.description,
        &request.target_department,
    )?;
    commit(app, &state)?;
    Ok(directive)
}

/// Typo alias for [`send_co_ceo_directive_to_state`] (historical invoke name).
#[tauri::command]
pub fn send_co_ceo_directive_to_stae(
    request: SendCoCeoDirectiveToStateRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<Directive, String> {
    send_co_ceo_directive_to_state(request, state, app)
}

#[tauri::command]
pub fn run_batch_executions(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<BatchExecutionResult, String> {
    let parallel = {
        let state = state.lock_or_recover()?;
        if state.settings.scrum_execution_paused {
            return Err("Execution queue is paused.".to_string());
        }
        state.settings.scrum_parallel_agents
    };

    if parallel {
        let mut result = BatchExecutionResult {
            attempted: 0,
            succeeded: 0,
            failed: 0,
            messages: Vec::new(),
        };
        if let Some(batch) = crate::scrum::parallel_executor::run_detached_parallel_tick(&app) {
            result.attempted = batch.executed;
            result.succeeded = batch.executed;
            result.messages = batch.messages;
        }
        if let Some(note) = crate::operations::try_scrum_auto_execute_after_work(&app) {
            result.messages.push(note);
        }
        return Ok(result);
    }

    let max_runs = {
        let state = state.lock_or_recover()?;
        state.settings.scrum_max_executions_per_tick.max(1)
    };
    let mut result = BatchExecutionResult {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        messages: Vec::new(),
    };

    for _ in 0..max_runs {
        let node_id = {
            let state = state.lock_or_recover()?;
            state
                .work_nodes
                .iter()
                .filter(|n| {
                    n.kind == WorkNodeKind::Task
                        && n.assignee_agent_id.is_some()
                        && matches!(n.status, WorkNodeStatus::InSprint | WorkNodeStatus::Ready)
                })
                .max_by(|a, b| a.priority.cmp(&b.priority))
                .map(|n| n.id.clone())
        };
        let Some(node_id) = node_id else {
            break;
        };
        result.attempted += 1;
        // Unlocked execute — AppState free during LLM/CLI.
        match execute_task(&app, &node_id) {
            Ok(run) => {
                if run.status == crate::scrum::ExecutionStatus::Succeeded {
                    result.succeeded += 1;
                    if let Ok(mut state) = state.lock_or_recover() {
                        let _ = crate::operations::advance_gigs_on_work_delivered(
                            &mut state,
                            run.actual_tokens,
                        );
                        let _ = commit(app.clone(), &state);
                    }
                } else {
                    result.failed += 1;
                }
                result.messages.push(format!(
                    "{}: {}",
                    run.work_node_id,
                    run.summary
                ));
            }
            Err(err) => {
                result.failed += 1;
                result.messages.push(format!("{node_id}: {err}"));
            }
        }
    }

    if let Some(note) = crate::operations::try_scrum_auto_execute_after_work(&app) {
        result.messages.push(note);
    }
    Ok(result)
}

#[tauri::command]
pub fn link_work_node_to_gig(
    work_node_id: String,
    contract_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<WorkNode, String> {
    let mut state = state.lock_or_recover()?;
    if !state.gig_contracts.iter().any(|c| c.contract_id == contract_id) {
        return Err("Gig contract not found.".to_string());
    }
    let node = state
        .work_nodes
        .iter_mut()
        .find(|n| n.id == work_node_id)
        .ok_or_else(|| "Work node not found.".to_string())?;
    node.linked_gig_contract_id = Some(contract_id);
    node.updated_at = now_iso();
    let snapshot = node.clone();
    commit(app, &state)?;
    Ok(snapshot)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationStatus {
    pub scrum_worker_last_tick_at: Option<String>,
    pub scrum_worker_log: Vec<String>,
    pub orchestrator_last_tick_at: Option<String>,
    pub orchestrator_log: Vec<String>,
    pub orchestrator_directives_total: u32,
    pub orchestrator_meetings_total: u32,
    pub sync_queue_pending: u32,
    pub hub_last_pull_at: Option<String>,
    pub company_vision: String,
    pub parallel_llm_enabled: bool,
    pub openclaw_available: bool,
    pub openclaw_version: Option<String>,
    pub openclaw_message: String,
    #[serde(default)]
    pub active_execution_runtimes: Vec<String>,
    pub readiness: crate::operations::AutomationReadiness,
    pub autopilot: crate::autopilot::AutopilotSnapshot,
}

#[tauri::command]
pub fn get_automation_status(state: State<'_, Mutex<AppState>>) -> Result<AutomationStatus, String> {
    let state = state.lock_or_recover()?;
    let openclaw = crate::agent_runtime::probe_active_runtime(&state.settings);
    let active_execution_runtimes: Vec<String> = state
        .agents
        .values()
        .filter(|agent| !crate::fate::is_system_agent(agent))
        .map(|agent| {
            crate::brain::resolve_execution_runtime(
                &state.settings,
                &state.department_agent_runtimes,
                &agent.department,
                agent,
            )
        })
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    Ok(AutomationStatus {
        scrum_worker_last_tick_at: state.scrum_worker.last_tick_at.clone(),
        scrum_worker_log: state.scrum_worker.recent_log.clone(),
        orchestrator_last_tick_at: state.orchestrator.last_tick_at.clone(),
        orchestrator_log: state.orchestrator.recent_log.clone(),
        orchestrator_directives_total: state.orchestrator.directives_issued_total,
        orchestrator_meetings_total: state.orchestrator.meetings_triggered,
        sync_queue_pending: state.sync_queue.len() as u32,
        hub_last_pull_at: state.hub.last_sync_at.clone(),
        company_vision: state.company_vision.clone(),
        parallel_llm_enabled: state.settings.scrum_parallel_agents,
        openclaw_available: openclaw.binary_available,
        openclaw_version: openclaw.version,
        openclaw_message: openclaw.message,
        active_execution_runtimes,
        readiness: crate::operations::compute_automation_readiness(&state),
        autopilot: crate::autopilot::compute_autopilot_snapshot(&state),
    })
}