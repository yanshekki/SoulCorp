use super::org::{
    agent_eligible_for_task, department_head_for, resolve_pm_agent_id, subordinates_of,
};
use super::tree::{new_node_id, now_iso};
use super::types::{
    Directive, DirectiveStatus, Sprint, SprintStatus, WorkNode, WorkNodeKind, WorkNodeStatus,
};
use crate::state::{AgentRecord, AppState};

pub fn skill_match_score(task: &WorkNode, agent: &AgentRecord) -> f32 {
    let task_text = format!(
        "{} {} {}",
        task.title,
        task.description,
        task.acceptance_criteria.join(" ")
    )
    .to_lowercase();
    let mut score = 0.15f32;
    if agent.department == task.department {
        score += 0.35;
    }
    for skill in &agent.skills {
        if task_text.contains(&skill.to_lowercase()) {
            score += 0.12;
        }
    }
    let role = agent.role.to_lowercase();
    if (role.contains("pm") || role.contains("project"))
        && matches!(task.kind, WorkNodeKind::Story | WorkNodeKind::Epic)
    {
        score += 0.1;
    }
    score * agent.energy.clamp(0.2, 1.0) * agent.morale.clamp(0.2, 1.0)
}

pub fn agent_capacity(agent: &AgentRecord, nodes: &[WorkNode]) -> f32 {
    let assigned: u8 = nodes
        .iter()
        .filter(|n| {
            n.assignee_agent_id.as_deref() == Some(agent.id.as_str())
                && !matches!(n.status, WorkNodeStatus::Done)
        })
        .map(|n| n.story_points.max(1))
        .sum();
    let wallet_bonus = 1.0f32;
    let load_penalty = 1.0 / (1.0 + assigned as f32 * 0.15);
    agent.energy.clamp(0.2, 1.0) * agent.morale.clamp(0.2, 1.0) * wallet_bonus * load_penalty
}

pub fn route_directive_rule_based(
    state: &mut AppState,
    directive_id: &str,
    project_id: &str,
) -> Result<Vec<WorkNode>, String> {
    let directive = state
        .directives
        .iter()
        .find(|d| d.id == directive_id)
        .cloned()
        .ok_or_else(|| "Directive not found.".to_string())?;

    let project = state
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .cloned()
        .ok_or_else(|| "Project not found.".to_string())?;

    let pm_id = resolve_pm_agent_id(state, Some(project_id));
    let dept_head = department_head_for(state, &project.owner_department);
    let rank = super::tree::next_backlog_rank(&state.work_nodes, project_id, None);
    let story_id = new_node_id();
    let now = now_iso();

    let story = WorkNode {
        id: story_id.clone(),
        parent_id: None,
        project_id: project_id.to_string(),
        kind: WorkNodeKind::Story,
        title: directive.title.clone(),
        description: directive.description.clone(),
        status: WorkNodeStatus::Ready,
        priority: 4,
        story_points: 5,
        backlog_rank: rank,
        assignee_agent_id: None,
        assigned_by_manager_id: dept_head.clone(),
        owner_pm_agent_id: pm_id.clone(),
        retry_count: 0,
        department: project.owner_department.clone(),
        sprint_id: None,
        depends_on: Vec::new(),
        acceptance_criteria: vec![
            "Deliverable documented in Workspace.".to_string(),
            "Acceptance criteria reviewed by PM.".to_string(),
        ],
        linked_workspace_page_id: None,
        linked_gig_contract_id: None,
        created_at: now.clone(),
        updated_at: now.clone(),
        completed_at: None,
    };

    let tasks = decompose_story_to_tasks(&story, &directive, &pm_id, dept_head.as_deref(), &now);
    let mut created = vec![story];
    created.extend(tasks);

    for node in &created {
        state.work_nodes.push(node.clone());
    }

    if let Some(directive) = state.directives.iter_mut().find(|d| d.id == directive_id) {
        directive.status = DirectiveStatus::Routed;
        directive.spawned_node_ids = created.iter().map(|n| n.id.clone()).collect();
    }

    Ok(created)
}

fn decompose_story_to_tasks(
    story: &WorkNode,
    directive: &Directive,
    pm_id: &Option<String>,
    dept_head: Option<&str>,
    now: &str,
) -> Vec<WorkNode> {
    let templates = [
        ("Research & scope", 2u8, "Gather context and constraints."),
        ("Implementation", 3u8, "Build the core deliverable."),
        ("Review & handoff", 1u8, "PM review and Workspace publish."),
    ];
    templates
        .iter()
        .enumerate()
        .map(|(index, (title, points, desc))| WorkNode {
            id: new_node_id(),
            parent_id: Some(story.id.clone()),
            project_id: story.project_id.clone(),
            kind: WorkNodeKind::Task,
            title: format!("{title}: {}", directive.title),
            description: desc.to_string(),
            status: WorkNodeStatus::Backlog,
            priority: story.priority,
            story_points: *points,
            backlog_rank: index as u32,
            assignee_agent_id: None,
            assigned_by_manager_id: dept_head.map(|id| id.to_string()),
            owner_pm_agent_id: pm_id.clone(),
            retry_count: 0,
            department: story.department.clone(),
            sprint_id: None,
            depends_on: Vec::new(),
            acceptance_criteria: vec![desc.to_string()],
            linked_workspace_page_id: None,
            linked_gig_contract_id: None,
            created_at: now.to_string(),
            updated_at: now.to_string(),
            completed_at: None,
        })
        .collect()
}

/// Department heads assign unowned sprint tasks to subordinates.
pub fn apply_department_head_delegation(state: &mut AppState) -> u32 {
    let mut delegated = 0u32;
    let managers: Vec<(String, String)> = state
        .agents
        .values()
        .filter(|a| !crate::fate::is_system_agent(a))
        .filter_map(|a| {
            a.manages_department
                .as_ref()
                .map(|dept| (a.id.clone(), dept.clone()))
        })
        .collect();

    let task_ids: Vec<String> = state
        .work_nodes
        .iter()
        .filter(|n| {
            n.kind == WorkNodeKind::Task
                && n.assignee_agent_id.is_none()
                && matches!(n.status, WorkNodeStatus::InSprint | WorkNodeStatus::Ready)
        })
        .map(|n| n.id.clone())
        .collect();

    for task_id in task_ids {
        let task = match state.work_nodes.iter().find(|n| n.id == task_id) {
            Some(t) => t.clone(),
            None => continue,
        };

        let manager_id = managers
            .iter()
            .find(|(_, dept)| dept == &task.department)
            .map(|(id, _)| id.clone())
            .or_else(|| task.assigned_by_manager_id.clone());

        let Some(manager_id) = manager_id else {
            continue;
        };

        let subs = subordinates_of(state, &manager_id);
        if subs.is_empty() {
            continue;
        }

        let agents: Vec<AgentRecord> = state
            .agents
            .values()
            .filter(|a| subs.contains(&a.id))
            .cloned()
            .collect();

        let best = agents
            .iter()
            .filter(|agent| agent_eligible_for_task(&task, agent, state))
            .map(|agent| {
                (
                    agent.id.clone(),
                    skill_match_score(&task, agent) * agent_capacity(agent, &state.work_nodes),
                )
            })
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            .filter(|(_, score)| *score > 0.15)
            .map(|(id, _)| id);

        let Some(agent_id) = best else {
            continue;
        };

        if let Some(node) = state.work_nodes.iter_mut().find(|n| n.id == task_id) {
            node.assignee_agent_id = Some(agent_id);
            node.assigned_by_manager_id = Some(manager_id);
            node.updated_at = now_iso();
            delegated += 1;
        }
    }
    delegated
}

pub fn plan_sprint(state: &mut AppState, sprint_id: &str) -> Result<u32, String> {
    let sprint = state
        .sprints
        .iter()
        .find(|s| s.id == sprint_id)
        .cloned()
        .ok_or_else(|| "Sprint not found.".to_string())?;

    let mut remaining = sprint.velocity_target;
    let mut assigned_count = 0u32;

    let mut ready_stories: Vec<WorkNode> = state
        .work_nodes
        .iter()
        .filter(|n| {
            n.project_id == sprint.project_id
                && n.kind == WorkNodeKind::Story
                && matches!(n.status, WorkNodeStatus::Ready | WorkNodeStatus::Backlog)
        })
        .cloned()
        .collect();
    ready_stories.sort_by(|a, b| b.priority.cmp(&a.priority).then(a.backlog_rank.cmp(&b.backlog_rank)));

    let agents: Vec<AgentRecord> = state
        .agents
        .values()
        .filter(|a| !crate::fate::is_system_agent(a))
        .cloned()
        .collect();

    for story in &ready_stories {
        if story.story_points > remaining {
            continue;
        }
        remaining = remaining.saturating_sub(story.story_points);

        if let Some(node) = state.work_nodes.iter_mut().find(|n| n.id == story.id) {
            node.status = WorkNodeStatus::InSprint;
            node.sprint_id = Some(sprint_id.to_string());
            node.updated_at = now_iso();
        }

        let task_ids: Vec<String> = state
            .work_nodes
            .iter()
            .filter(|n| n.parent_id.as_deref() == Some(story.id.as_str()))
            .map(|n| n.id.clone())
            .collect();

        for task_id in task_ids {
            if let Some(task) = state.work_nodes.iter().find(|n| n.id == task_id).cloned() {
                if task.assignee_agent_id.is_some() {
                    continue;
                }
                let best = pick_best_agent(state, &task, &agents, &state.work_nodes);
                if let Some(agent_id) = best {
                    if let Some(node) = state.work_nodes.iter_mut().find(|n| n.id == task_id) {
                        node.assignee_agent_id = Some(agent_id);
                        node.status = WorkNodeStatus::InSprint;
                        node.sprint_id = Some(sprint_id.to_string());
                        node.updated_at = now_iso();
                        assigned_count += 1;
                    }
                }
            }
        }
    }

    if let Some(sprint_mut) = state.sprints.iter_mut().find(|s| s.id == sprint_id) {
        sprint_mut.committed_story_ids = state
            .work_nodes
            .iter()
            .filter(|n| n.sprint_id.as_deref() == Some(sprint_id) && n.kind == WorkNodeKind::Story)
            .map(|n| n.id.clone())
            .collect();
    }

    Ok(assigned_count)
}

fn pick_best_agent(
    state: &AppState,
    task: &WorkNode,
    agents: &[AgentRecord],
    nodes: &[WorkNode],
) -> Option<String> {
    agents
        .iter()
        .filter(|agent| agent_eligible_for_task(task, agent, state))
        .map(|agent| {
            (
                agent.id.clone(),
                skill_match_score(task, agent) * agent_capacity(agent, nodes),
            )
        })
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        .filter(|(_, score)| *score > 0.2)
        .map(|(id, _)| id)
}

pub fn board_snapshot(state: &AppState, project_id: &str) -> super::types::ScrumBoardSnapshot {
    let active_sprint = state
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .and_then(|p| p.active_sprint_id.clone())
        .and_then(|sid| state.sprints.iter().find(|s| s.id == sid).cloned());

    let project_nodes: Vec<WorkNode> = state
        .work_nodes
        .iter()
        .filter(|n| n.project_id == project_id)
        .cloned()
        .collect();

    let burndown_total: u8 = project_nodes
        .iter()
        .filter(|n| n.kind == WorkNodeKind::Task && n.sprint_id.is_some())
        .map(|n| n.story_points.max(1))
        .sum();

    let burndown_remaining: u8 = project_nodes
        .iter()
        .filter(|n| {
            n.kind == WorkNodeKind::Task
                && n.sprint_id.is_some()
                && !matches!(n.status, WorkNodeStatus::Done)
        })
        .map(|n| n.story_points.max(1))
        .sum();

    super::types::ScrumBoardSnapshot {
        project_id: project_id.to_string(),
        active_sprint,
        backlog: project_nodes
            .iter()
            .filter(|n| matches!(n.status, WorkNodeStatus::Backlog | WorkNodeStatus::Ready) && n.sprint_id.is_none())
            .cloned()
            .collect(),
        sprint_items: project_nodes
            .iter()
            .filter(|n| n.status == WorkNodeStatus::InSprint)
            .cloned()
            .collect(),
        in_progress: project_nodes
            .iter()
            .filter(|n| n.status == WorkNodeStatus::InProgress)
            .cloned()
            .collect(),
        in_review: project_nodes
            .iter()
            .filter(|n| n.status == WorkNodeStatus::InReview)
            .cloned()
            .collect(),
        done: project_nodes
            .iter()
            .filter(|n| n.status == WorkNodeStatus::Done)
            .cloned()
            .collect(),
        burndown_remaining,
        burndown_total,
    }
}

pub fn agent_inboxes(state: &AppState) -> Vec<super::types::AgentInboxEntry> {
    let mut entries: Vec<super::types::AgentInboxEntry> = state
        .agents
        .values()
        .filter(|a| !crate::fate::is_system_agent(a))
        .map(|agent| {
            let tasks: Vec<WorkNode> = state
                .work_nodes
                .iter()
                .filter(|n| {
                    n.assignee_agent_id.as_deref() == Some(agent.id.as_str())
                        && !matches!(n.status, WorkNodeStatus::Done)
                })
                .cloned()
                .collect();
            let assigned_points: u8 = tasks.iter().map(|t| t.story_points.max(1)).sum();
            super::types::AgentInboxEntry {
                agent_id: agent.id.clone(),
                agent_name: agent.name.clone(),
                agent_role: agent.role.clone(),
                department: agent.department.clone(),
                assigned_points,
                tasks,
            }
        })
        .collect();
    entries.sort_by_key(|b| std::cmp::Reverse(b.assigned_points));
    entries
}

/// Real-time sprint lifecycle for v1 (wall-clock) and v2 (simulation day).
pub fn advance_sprint_lifecycle(state: &mut AppState) -> u32 {
    let mut advanced = 0u32;
    if crate::config::is_v2() {
        maybe_advance_sprint_cycle(state);
    }

    let project_ids: Vec<String> = state.projects.iter().map(|p| p.id.clone()).collect();
    for project_id in project_ids {
        let Some(sprint_id) = state
            .projects
            .iter()
            .find(|p| p.id == project_id)
            .and_then(|p| p.active_sprint_id.clone())
        else {
            continue;
        };

        let sprint = match state.sprints.iter().find(|s| s.id == sprint_id) {
            Some(s) => s.clone(),
            None => continue,
        };

        if sprint.status == SprintStatus::Planning {
            if let Some(s) = state.sprints.iter_mut().find(|s| s.id == sprint_id) {
                s.status = SprintStatus::Active;
                if s.started_at.is_none() {
                    s.started_at = Some(now_iso());
                }
            }
            let _ = plan_sprint(state, &sprint_id);
            advanced += 1;
            continue;
        }

        if sprint.status != SprintStatus::Active {
            continue;
        }

        let should_close = if crate::config::is_v2() {
            state.day_number >= sprint.end_day
        } else {
            sprint_started_days_ago(&sprint) >= sprint.cycle_length_days
        };

        if !should_close {
            continue;
        }

        if let Some(s) = state.sprints.iter_mut().find(|s| s.id == sprint_id) {
            s.status = SprintStatus::Closed;
        }
        if let Some(project) = state.projects.iter_mut().find(|p| p.id == project_id) {
            project.active_sprint_id = None;
        }
        let _ = ensure_active_sprint(state, &project_id);
        advanced += 1;
    }
    advanced
}

fn sprint_started_days_ago(sprint: &Sprint) -> u32 {
    let Some(started) = sprint.started_at.as_deref() else {
        return 0;
    };
    let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(started) else {
        return 0;
    };
    let elapsed = chrono::Utc::now().signed_duration_since(parsed.with_timezone(&chrono::Utc));
    (elapsed.num_days().max(0) as u32).saturating_add(1)
}

pub fn maybe_advance_sprint_cycle(state: &mut AppState) {
    for project in state.projects.clone() {
        let Some(sprint_id) = project.active_sprint_id.clone() else {
            continue;
        };
        let sprint = match state.sprints.iter().find(|s| s.id == sprint_id) {
            Some(s) => s.clone(),
            None => continue,
        };
        if sprint.status != SprintStatus::Active {
            continue;
        }
        if state.day_number < sprint.end_day {
            continue;
        }
        if let Some(s) = state.sprints.iter_mut().find(|s| s.id == sprint_id) {
            s.status = SprintStatus::Review;
        }
    }
}

pub fn ensure_active_sprint(state: &mut AppState, project_id: &str) -> Result<String, String> {
    if let Some(project) = state.projects.iter().find(|p| p.id == project_id) {
        if let Some(sid) = &project.active_sprint_id {
            if state.sprints.iter().any(|s| s.id == *sid) {
                return Ok(sid.clone());
            }
        }
    }

    let sprint_id = format!("sprint-{}", uuid::Uuid::new_v4());
    let start = state.day_number;
    let cycle = state
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .map(|p| p.default_cycle_days)
        .unwrap_or(14);
    let sprint = Sprint {
        id: sprint_id.clone(),
        project_id: project_id.to_string(),
        name: format!("Sprint {}", state.sprints.len() + 1),
        goal: String::new(),
        cycle_length_days: cycle,
        start_day: start,
        end_day: start.saturating_add(cycle),
        status: SprintStatus::Planning,
        committed_story_ids: Vec::new(),
        velocity_target: 21,
        started_at: None,
    };
    state.sprints.push(sprint);
    if let Some(project) = state.projects.iter_mut().find(|p| p.id == project_id) {
        project.active_sprint_id = Some(sprint_id.clone());
    }
    Ok(sprint_id)
}