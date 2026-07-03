use super::types::{WorkNode, WorkNodeKind, WorkNodeStatus, WorkTreeNode, WorkTreeSnapshot};
use chrono::Utc;
use uuid::Uuid;

pub fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

pub fn new_node_id() -> String {
    format!("wn-{}", Uuid::new_v4())
}

pub fn child_kind(parent: WorkNodeKind) -> Option<WorkNodeKind> {
    match parent {
        WorkNodeKind::Program => Some(WorkNodeKind::Epic),
        WorkNodeKind::Epic => Some(WorkNodeKind::Story),
        WorkNodeKind::Story => Some(WorkNodeKind::Task),
        WorkNodeKind::Task => None,
    }
}

pub fn validate_parent_child(parent: WorkNodeKind, child: WorkNodeKind) -> bool {
    child_kind(parent) == Some(child)
}

pub fn validate_depends_on_dag(nodes: &[WorkNode], node_id: &str, depends_on: &[String]) -> Result<(), String> {
    for dep in depends_on {
        if dep == node_id {
            return Err("A task cannot depend on itself.".to_string());
        }
        if !nodes.iter().any(|n| n.id == *dep) {
            return Err(format!("Dependency '{dep}' not found."));
        }
    }
    if has_cycle(nodes, node_id, depends_on) {
        return Err("Dependency cycle detected.".to_string());
    }
    Ok(())
}

fn has_cycle(nodes: &[WorkNode], node_id: &str, depends_on: &[String]) -> bool {
    let mut visited = std::collections::HashSet::new();
    let mut stack = depends_on.to_vec();
    while let Some(current) = stack.pop() {
        if current == node_id {
            return true;
        }
        if !visited.insert(current.clone()) {
            continue;
        }
        if let Some(node) = nodes.iter().find(|n| n.id == current) {
            stack.extend(node.depends_on.clone());
        }
    }
    false
}

pub fn build_work_tree(project_id: &str, nodes: &[WorkNode]) -> WorkTreeSnapshot {
    let project_nodes: Vec<WorkNode> = nodes
        .iter()
        .filter(|n| n.project_id == project_id)
        .cloned()
        .collect();

    let mut sorted = project_nodes.clone();
    sorted.sort_by(|a, b| {
        b.priority
            .cmp(&a.priority)
            .then_with(|| a.backlog_rank.cmp(&b.backlog_rank))
            .then_with(|| a.title.cmp(&b.title))
    });

    fn build_children(parent_id: Option<&str>, all: &[WorkNode]) -> Vec<WorkTreeNode> {
        let mut children: Vec<WorkNode> = all
            .iter()
            .filter(|n| n.parent_id.as_deref() == parent_id)
            .cloned()
            .collect();
        children.sort_by(|a, b| {
            b.priority
                .cmp(&a.priority)
                .then_with(|| a.backlog_rank.cmp(&b.backlog_rank))
        });
        children
            .into_iter()
            .map(|node| {
                let id = node.id.clone();
                WorkTreeNode {
                    children: build_children(Some(&id), all),
                    node,
                }
            })
            .collect()
    }

    WorkTreeSnapshot {
        project_id: project_id.to_string(),
        nodes: build_children(None, &sorted),
        flat: sorted,
    }
}

pub fn next_backlog_rank(nodes: &[WorkNode], project_id: &str, parent_id: Option<&str>) -> u32 {
    nodes
        .iter()
        .filter(|n| n.project_id == project_id && n.parent_id.as_deref() == parent_id)
        .map(|n| n.backlog_rank)
        .max()
        .unwrap_or(0)
        .saturating_add(1)
}

pub fn mark_story_done_if_tasks_complete(nodes: &mut [WorkNode], story_id: &str) {
    let task_ids: Vec<String> = nodes
        .iter()
        .filter(|n| n.parent_id.as_deref() == Some(story_id) && n.kind == WorkNodeKind::Task)
        .map(|n| n.id.clone())
        .collect();
    if task_ids.is_empty() {
        return;
    }
    let all_done = task_ids.iter().all(|id| {
        nodes
            .iter()
            .find(|n| n.id == *id)
            .is_some_and(|n| n.status == WorkNodeStatus::Done)
    });
    if all_done {
        if let Some(story) = nodes.iter_mut().find(|n| n.id == story_id) {
            story.status = WorkNodeStatus::Done;
            story.completed_at = Some(now_iso());
            story.updated_at = now_iso();
        }
    }
}

pub fn recompute_project_progress(
    projects: &mut [crate::state::InternalProject],
    nodes: &[WorkNode],
    project_id: &str,
) {
    let stories: Vec<&WorkNode> = nodes
        .iter()
        .filter(|n| n.project_id == project_id && n.kind == WorkNodeKind::Story)
        .collect();
    if stories.is_empty() {
        return;
    }
    let done = stories
        .iter()
        .filter(|n| n.status == WorkNodeStatus::Done)
        .count();
    let progress = done as f32 / stories.len() as f32;
    if let Some(project) = projects.iter_mut().find(|p| p.id == project_id) {
        project.progress = progress.clamp(0.0, 1.0);
    }
}