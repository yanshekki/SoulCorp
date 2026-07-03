use super::types::{
    Directive, DirectiveSource, DirectiveStatus, DirectiveTarget, ExecutionStatus, WorkNode,
    WorkNodeKind, WorkNodeStatus,
};
use crate::state::AppState;
use crate::token_budget::total_company_tokens;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandCenterAlert {
    pub severity: String,
    pub message: String,
    pub action_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandCenterOverview {
    pub day_number: u32,
    pub token_pool: u64,
    pub monthly_burn: u64,
    pub avg_morale: f32,
    pub avg_energy: f32,
    pub open_directives: u32,
    pub blocked_tasks: u32,
    pub failed_runs: u32,
    pub throttled_runs: u32,
    pub unassigned_sprint_tasks: u32,
    pub active_sprint_name: Option<String>,
    pub burndown_remaining: u8,
    pub burndown_total: u8,
    pub execution_paused: bool,
    pub alerts: Vec<CommandCenterAlert>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectivePreviewNode {
    pub kind: WorkNodeKind,
    pub title: String,
    pub description: String,
    pub story_points: u8,
    pub department: String,
    pub children: Vec<DirectivePreviewNode>,
}

pub fn build_overview(state: &AppState, project_id: Option<&str>) -> CommandCenterOverview {
    let agents: Vec<_> = state
        .agents
        .values()
        .filter(|a| !crate::fate::is_system_agent(a))
        .collect();
    let avg_morale = if agents.is_empty() {
        0.0
    } else {
        agents.iter().map(|a| a.morale).sum::<f32>() / agents.len() as f32
    };
    let avg_energy = if agents.is_empty() {
        0.0
    } else {
        agents.iter().map(|a| a.energy).sum::<f32>() / agents.len() as f32
    };

    let open_directives = state
        .directives
        .iter()
        .filter(|d| matches!(d.status, DirectiveStatus::Open | DirectiveStatus::Routed | DirectiveStatus::Executing))
        .count() as u32;

    let blocked_tasks = state
        .work_nodes
        .iter()
        .filter(|n| n.status == WorkNodeStatus::Blocked)
        .count() as u32;

    let failed_runs = state
        .execution_runs
        .iter()
        .filter(|r| r.status == ExecutionStatus::Failed)
        .count() as u32;

    let throttled_runs = state
        .execution_runs
        .iter()
        .filter(|r| r.status == ExecutionStatus::Throttled)
        .count() as u32;

    let unassigned_sprint_tasks = state
        .work_nodes
        .iter()
        .filter(|n| {
            n.kind == WorkNodeKind::Task
                && n.assignee_agent_id.is_none()
                && matches!(n.status, WorkNodeStatus::InSprint | WorkNodeStatus::Ready)
        })
        .count() as u32;

    let (active_sprint_name, burndown_remaining, burndown_total) = project_id
        .map(|pid| {
            let b = super::scheduler::board_snapshot(state, pid);
            (
                b.active_sprint.map(|s| s.name),
                b.burndown_remaining,
                b.burndown_total,
            )
        })
        .unwrap_or((None, 0, 0));

    let mut alerts = Vec::new();
    if state.settings.scrum_execution_paused {
        alerts.push(CommandCenterAlert {
            severity: "warn".into(),
            message: "Execution queue is paused.".into(),
            action_ref: None,
        });
    }
    if state.settings.scrum_min_tokens_guard > 0
        && total_company_tokens(&state.token_economy) < state.settings.scrum_min_tokens_guard
    {
        alerts.push(CommandCenterAlert {
            severity: "critical".into(),
            message: "Token pool is low — executions may throttle.".into(),
            action_ref: Some("finance".into()),
        });
    }
    if blocked_tasks > 0 {
        alerts.push(CommandCenterAlert {
            severity: "warn".into(),
            message: format!("{blocked_tasks} blocked task(s) need attention."),
            action_ref: Some("backlog".into()),
        });
    }
    if unassigned_sprint_tasks > 0 {
        alerts.push(CommandCenterAlert {
            severity: "info".into(),
            message: format!("{unassigned_sprint_tasks} sprint task(s) still unassigned."),
            action_ref: Some("inbox".into()),
        });
    }
    for directive in state.directives.iter().filter(|d| d.status == DirectiveStatus::Open) {
        alerts.push(CommandCenterAlert {
            severity: "info".into(),
            message: format!("Directive awaiting route: {}", directive.title),
            action_ref: Some(directive.id.clone()),
        });
    }

    CommandCenterOverview {
        day_number: state.day_number,
        token_pool: total_company_tokens(&state.token_economy),
        monthly_burn: state.token_economy.monthly_burn_tokens,
        avg_morale,
        avg_energy,
        open_directives,
        blocked_tasks,
        failed_runs,
        throttled_runs,
        unassigned_sprint_tasks,
        active_sprint_name,
        burndown_remaining,
        burndown_total,
        execution_paused: state.settings.scrum_execution_paused,
        alerts,
    }
}

pub fn preview_route_directive(
    state: &AppState,
    directive_id: &str,
    project_id: &str,
    use_llm: bool,
) -> Result<Vec<DirectivePreviewNode>, String> {
    let mut scratch = state.clone();
    let created = if use_llm {
        super::executor::route_directive_llm(&mut scratch, directive_id, project_id)?
    } else {
        super::scheduler::route_directive_rule_based(&mut scratch, directive_id, project_id)?
    };
    Ok(created
        .iter()
        .filter(|n| n.parent_id.is_none())
        .map(|root| to_preview_node(root, &scratch.work_nodes))
        .collect())
}

fn to_preview_node(node: &WorkNode, all: &[WorkNode]) -> DirectivePreviewNode {
    let children: Vec<DirectivePreviewNode> = all
        .iter()
        .filter(|n| n.parent_id.as_deref() == Some(node.id.as_str()))
        .map(|child| to_preview_node(child, all))
        .collect();
    DirectivePreviewNode {
        kind: node.kind,
        title: node.title.clone(),
        description: node.description.clone(),
        story_points: node.story_points,
        department: node.department.clone(),
        children,
    }
}

pub fn issue_directive_record(
    state: &mut AppState,
    title: String,
    description: String,
    source: DirectiveSource,
    target: DirectiveTarget,
    target_ref: String,
) -> Directive {
    let directive = Directive {
        id: format!("dir-{}", Uuid::new_v4()),
        title,
        description,
        source,
        target,
        target_ref,
        status: DirectiveStatus::Open,
        spawned_node_ids: Vec::new(),
        created_at: super::tree::now_iso(),
    };
    state.directives.push(directive.clone());
    directive
}

pub fn issue_meeting_directive_and_route(
    state: &mut AppState,
    meeting_type: &str,
    summary: &str,
) -> Option<Directive> {
    if meeting_type != "Project Kickoff" && meeting_type != "Strategy Discussion" {
        return None;
    }
    let project_id = state
        .projects
        .iter()
        .min_by_key(|p| p.priority)
        .map(|p| p.id.clone())?;
    let directive = issue_directive_record(
        state,
        format!("{meeting_type} outcome"),
        summary.to_string(),
        DirectiveSource::Meeting,
        DirectiveTarget::Project,
        project_id.clone(),
    );
    let directive_id = directive.id.clone();
    let _ = super::scheduler::route_directive_rule_based(state, &directive_id, &project_id);
    if state.settings.scrum_auto_schedule {
        if let Ok(sprint_id) = super::scheduler::ensure_active_sprint(state, &project_id) {
            let _ = super::scheduler::plan_sprint(state, &sprint_id);
        }
    }
    state
        .directives
        .iter()
        .find(|d| d.id == directive_id)
        .cloned()
}

pub fn issue_marketplace_directive(
    state: &mut AppState,
    contract_id: &str,
    title: &str,
    description: &str,
) -> Directive {
    let project_id = state
        .projects
        .iter()
        .min_by_key(|p| p.priority)
        .map(|p| p.id.clone())
        .unwrap_or_else(|| "proj-core".to_string());
    let directive = issue_directive_record(
        state,
        format!("Deliver gig: {title}"),
        description.to_string(),
        DirectiveSource::Marketplace,
        DirectiveTarget::Project,
        project_id.clone(),
    );
    let directive_id = directive.id.clone();
    if let Ok(nodes) = super::scheduler::route_directive_rule_based(state, &directive_id, &project_id) {
        for node in nodes {
            if node.kind == WorkNodeKind::Story {
                if let Some(work) = state.work_nodes.iter_mut().find(|n| n.id == node.id) {
                    work.linked_gig_contract_id = Some(contract_id.to_string());
                }
            }
        }
    }
    state
        .directives
        .iter()
        .find(|d| d.id == directive_id)
        .cloned()
        .unwrap_or(directive)
}

pub fn issue_co_ceo_directive(
    state: &mut AppState,
    title: &str,
    description: &str,
    target_department: &str,
) -> Result<Directive, String> {
    let project_id = state
        .projects
        .iter()
        .find(|p| p.owner_department == target_department)
        .map(|p| p.id.clone())
        .or_else(|| state.projects.first().map(|p| p.id.clone()))
        .ok_or_else(|| "No project available for Co-CEO directive.".to_string())?;
    let directive = issue_directive_record(
        state,
        title.to_string(),
        description.to_string(),
        DirectiveSource::CoCeo,
        DirectiveTarget::Project,
        project_id.clone(),
    );
    let directive_id = directive.id.clone();
    super::scheduler::route_directive_rule_based(state, &directive_id, &project_id)?;
    if state.settings.scrum_auto_schedule {
        if let Ok(sprint_id) = super::scheduler::ensure_active_sprint(state, &project_id) {
            let _ = super::scheduler::plan_sprint(state, &sprint_id);
        }
    }
    state
        .directives
        .iter()
        .find(|d| d.id == directive_id)
        .cloned()
        .ok_or_else(|| "Directive not found after routing.".to_string())
}