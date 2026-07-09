use crate::scrum::pm_review::approve_deliverable_core;
use crate::scrum::tree::now_iso;
use crate::scrum::types::{DirectiveSource, DirectiveStatus, DirectiveTarget, WorkNodeKind, WorkNodeStatus};
use crate::state::{AppState, AutopilotIntervention};
use crate::workspace::models::AddPageCommentRequest;
use crate::workspace::storage::{company_workspace_root, WorkspaceStorage};
use tauri::{AppHandle, Manager};
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

fn write_workspace_ceo_comment(
    app: &AppHandle,
    state: &AppState,
    page_id: &str,
    comment: &str,
) -> Result<(), String> {
    if state.company_id.is_empty() {
        return Ok(());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = WorkspaceStorage::new(company_workspace_root(&dir, &state.company_id))?;
    storage.add_page_comment(&AddPageCommentRequest {
        page_id: page_id.to_string(),
        author: "CEO".to_string(),
        content: comment.to_string(),
    })?;
    Ok(())
}

pub fn ceo_comment_on_item(
    state: &mut AppState,
    app: Option<&AppHandle>,
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
        "work_node" | "deliverable" | "story" | "story_brief" => {
            let page_id = state
                .work_nodes
                .iter()
                .find(|n| n.id == item_id)
                .and_then(|n| n.linked_workspace_page_id.clone());
            let node = state
                .work_nodes
                .iter_mut()
                .find(|n| n.id == item_id)
                .ok_or_else(|| "Work node not found.".to_string())?;
            node.description = format!(
                "{}\n\n[CEO comment: {}]",
                node.description, trimmed
            );
            if let (Some(app), Some(page_id)) = (app, page_id) {
                let _ = write_workspace_ceo_comment(app, state, &page_id, trimmed);
            }
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

pub fn ceo_edit_directive(
    state: &mut AppState,
    directive_id: &str,
    title: Option<&str>,
    description: Option<&str>,
) -> Result<(), String> {
    let directive = state
        .directives
        .iter_mut()
        .find(|d| d.id == directive_id)
        .ok_or_else(|| "Directive not found.".to_string())?;
    if let Some(title) = title {
        let trimmed = title.trim();
        if !trimmed.is_empty() {
            directive.title = trimmed.to_string();
        }
    }
    if let Some(description) = description {
        directive.description = description.trim().to_string();
    }
    record_intervention(state, "edit", "directive", directive_id, "");
    Ok(())
}

pub fn ceo_update_story_criteria(
    state: &mut AppState,
    story_id: &str,
    criteria: Vec<String>,
) -> Result<(), String> {
    let cleaned: Vec<String> = criteria
        .into_iter()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
        .collect();
    if cleaned.len() < 2 {
        return Err("Provide at least 2 acceptance criteria.".to_string());
    }
    let node = state
        .work_nodes
        .iter_mut()
        .find(|n| n.id == story_id && n.kind == WorkNodeKind::Story)
        .ok_or_else(|| "Story not found.".to_string())?;
    node.acceptance_criteria = cleaned;
    node.updated_at = now_iso();
    record_intervention(state, "edit_criteria", "story", story_id, "");
    Ok(())
}

pub fn ceo_reroute_story(state: &mut AppState, story_id: &str) -> Result<String, String> {
    let (project_id, directive_id) = {
        let story = state
            .work_nodes
            .iter()
            .find(|n| n.id == story_id && n.kind == WorkNodeKind::Story)
            .ok_or_else(|| "Story not found.".to_string())?;
        let directive_id = state
            .directives
            .iter()
            .find(|d| d.spawned_node_ids.contains(&story_id.to_string()))
            .map(|d| d.id.clone());
        (story.project_id.clone(), directive_id)
    };

    let child_ids: Vec<String> = state
        .work_nodes
        .iter()
        .filter(|n| n.parent_id.as_deref() == Some(story_id))
        .map(|n| n.id.clone())
        .collect();
    state.work_nodes.retain(|n| n.id != story_id && !child_ids.contains(&n.id));

    if let Some(directive_id) = directive_id {
        if let Some(directive) = state.directives.iter_mut().find(|d| d.id == directive_id) {
            directive.status = DirectiveStatus::Open;
            directive.spawned_node_ids.retain(|id| id != story_id);
            directive.awaiting_ceo_gate = false;
            record_intervention(state, "reroute", "story", story_id, "");
            return Ok(directive_id);
        }
    }

    let directive = crate::scrum::command_center::issue_directive_record(
        state,
        "CEO re-route request".into(),
        format!("Re-route story {story_id} with updated criteria."),
        DirectiveSource::Ceo,
        DirectiveTarget::Project,
        project_id,
    );
    record_intervention(state, "reroute", "story", story_id, "");
    Ok(directive.id)
}

pub fn meeting_follow_up_directive(
    state: &mut AppState,
    meeting_id: &str,
) -> Result<crate::scrum::types::Directive, String> {
    let (meeting_type, summary) = {
        let meeting = state
            .meetings
            .get(meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?;
        (
            meeting.meeting_type.clone(),
            meeting
                .outcome_summary
                .clone()
                .unwrap_or_else(|| "Follow up on meeting action items.".to_string()),
        )
    };
    let project_id = state
        .projects
        .iter()
        .min_by_key(|p| p.priority)
        .map(|p| p.id.clone())
        .ok_or_else(|| "No project for follow-up directive.".to_string())?;

    let directive = crate::scrum::command_center::issue_directive_record(
        state,
        format!("Follow-up: {meeting_type}"),
        summary,
        DirectiveSource::Meeting,
        DirectiveTarget::Project,
        project_id.clone(),
    );
    let directive_id = directive.id.clone();
    if !super::gates_directives(state) {
        let _ = crate::scrum::scheduler::route_directive_rule_based(
            state,
            &directive_id,
            &project_id,
        );
    } else if let Some(d) = state.directives.iter_mut().find(|d| d.id == directive_id) {
        d.awaiting_ceo_gate = true;
    }
    dismiss_meeting_gate(state, meeting_id);
    record_intervention(state, "follow_up", "meeting", meeting_id, "");
    state
        .directives
        .iter()
        .find(|d| d.id == directive_id)
        .cloned()
        .ok_or_else(|| "Directive not found.".to_string())
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