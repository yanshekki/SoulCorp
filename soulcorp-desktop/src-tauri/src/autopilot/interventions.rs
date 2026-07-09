use crate::scrum::pm_review::approve_deliverable_core;
use crate::state::AutopilotIntervention;
use crate::scrum::tree::now_iso;
use crate::scrum::types::{DirectiveStatus, WorkNodeKind, WorkNodeStatus};
use crate::state::AppState;
use uuid::Uuid;

pub fn record_intervention(
    state: &mut AppState,
    action: &str,
    item_kind: &str,
    item_id: &str,
    comment: &str,
) {
    let intervention = AutopilotIntervention {
        id: format!("int-{}", Uuid::new_v4()),
        action: action.to_string(),
        item_kind: item_kind.to_string(),
        item_id: item_id.to_string(),
        comment: comment.to_string(),
        timestamp: now_iso(),
    };
    state.autopilot.recent_interventions.push(intervention);
    while state.autopilot.recent_interventions.len() > 20 {
        state.autopilot.recent_interventions.remove(0);
    }
}

pub fn ceo_approve_directive(state: &mut AppState, directive_id: &str) -> Result<(), String> {
    let directive = state
        .directives
        .iter_mut()
        .find(|d| d.id == directive_id)
        .ok_or_else(|| "Directive not found.".to_string())?;
    if !directive.awaiting_ceo_gate {
        return Err("Directive is not awaiting CEO approval.".to_string());
    }
    directive.awaiting_ceo_gate = false;
    record_intervention(state, "approve", "directive", directive_id, "");
    Ok(())
}

pub fn ceo_reject_directive(state: &mut AppState, directive_id: &str, reason: &str) -> Result<(), String> {
    let directive = state
        .directives
        .iter_mut()
        .find(|d| d.id == directive_id)
        .ok_or_else(|| "Directive not found.".to_string())?;
    directive.status = DirectiveStatus::Cancelled;
    directive.awaiting_ceo_gate = false;
    if !reason.trim().is_empty() {
        directive.description = format!(
            "{}\n\n[CEO rejected: {}]",
            directive.description, reason.trim()
        );
    }
    record_intervention(state, "reject", "directive", directive_id, reason);
    Ok(())
}

pub fn ceo_comment_on_item(
    state: &mut AppState,
    item_kind: &str,
    item_id: &str,
    comment: &str,
) -> Result<(), String> {
    let trimmed = comment.trim();
    if trimmed.is_empty() {
        return Err("Comment cannot be empty.".to_string());
    }

    match item_kind {
        "directive" => {
            let directive = state
                .directives
                .iter_mut()
                .find(|d| d.id == item_id)
                .ok_or_else(|| "Directive not found.".to_string())?;
            directive.ceo_comment = if directive.ceo_comment.is_empty() {
                trimmed.to_string()
            } else {
                format!("{}\n{}", directive.ceo_comment, trimmed)
            };
            directive.description = format!(
                "{}\n\n[CEO comment: {}]",
                directive.description, trimmed
            );
        }
        "work_node" | "deliverable" => {
            let node = state
                .work_nodes
                .iter_mut()
                .find(|n| n.id == item_id)
                .ok_or_else(|| "Work node not found.".to_string())?;
            node.description = format!(
                "{}\n\n[CEO comment: {}]",
                node.description, trimmed
            );
        }
        "meeting" => {
            state
                .autopilot
                .dismissed_meeting_ids
                .push(item_id.to_string());
        }
        _ => return Err(format!("Unknown item kind: {item_kind}")),
    }

    record_intervention(state, "comment", item_kind, item_id, trimmed);
    Ok(())
}

pub fn ceo_reject_deliverable(
    state: &mut AppState,
    work_node_id: &str,
    feedback: &str,
) -> Result<(), String> {
    let (parent_id, project_id, title) = {
        let node = state
            .work_nodes
            .iter()
            .find(|n| n.id == work_node_id)
            .ok_or_else(|| "Work node not found.".to_string())?;
        if node.status != WorkNodeStatus::InReview {
            return Err("Task is not awaiting review.".to_string());
        }
        (
            node.parent_id.clone(),
            node.project_id.clone(),
            node.title.clone(),
        )
    };

    if let Some(node) = state.work_nodes.iter_mut().find(|n| n.id == work_node_id) {
        node.status = WorkNodeStatus::Done;
        node.completed_at = Some(now_iso());
        node.updated_at = now_iso();
        node.awaiting_ceo_gate = false;
    }

    let revision_id = crate::scrum::tree::new_node_id();
    let now = now_iso();
    let revision = crate::scrum::types::WorkNode {
        id: revision_id.clone(),
        parent_id: parent_id.clone(),
        project_id: project_id.clone(),
        kind: WorkNodeKind::Task,
        title: format!("Revision: {title}"),
        description: if feedback.trim().is_empty() {
            "CEO requested revisions.".to_string()
        } else {
            format!("CEO feedback: {}", feedback.trim())
        },
        status: WorkNodeStatus::Ready,
        priority: 5,
        story_points: 2,
        backlog_rank: 0,
        assignee_agent_id: None,
        assigned_by_manager_id: None,
        owner_pm_agent_id: state.default_pm_agent_id.clone(),
        retry_count: 0,
        department: state
            .work_nodes
            .iter()
            .find(|n| n.id == work_node_id)
            .map(|n| n.department.clone())
            .unwrap_or_else(|| "Engineering".to_string()),
        sprint_id: None,
        depends_on: vec![work_node_id.to_string()],
        acceptance_criteria: vec![
            "Address CEO feedback.".to_string(),
            "Updated deliverable in Workspace.".to_string(),
        ],
        linked_workspace_page_id: None,
        linked_gig_contract_id: None,
        created_at: now.clone(),
        updated_at: now,
        completed_at: None,
        awaiting_ceo_gate: false,
    };
    state.work_nodes.push(revision);

    record_intervention(state, "reject", "deliverable", work_node_id, feedback);
    Ok(())
}

pub fn dismiss_meeting_gate(state: &mut AppState, meeting_id: &str) {
    if !state.autopilot.dismissed_meeting_ids.contains(&meeting_id.to_string()) {
        state.autopilot.dismissed_meeting_ids.push(meeting_id.to_string());
    }
    record_intervention(state, "dismiss", "meeting", meeting_id, "");
}

pub fn approve_deliverable_with_gate(
    state: &mut AppState,
    work_node_id: &str,
) -> Result<(), String> {
    approve_deliverable_core(state, work_node_id)?;
    if let Some(node) = state.work_nodes.iter().find(|n| n.id == work_node_id) {
        if node.status == WorkNodeStatus::Done {
            state.autopilot.deliverables_this_week += 1;
        }
    }
    record_intervention(state, "approve", "deliverable", work_node_id, "");
    Ok(())
}