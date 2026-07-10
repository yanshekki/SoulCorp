use super::org::resolve_pm_agent_id;
use super::tree::{mark_story_done_if_tasks_complete, now_iso, recompute_project_progress};
use super::types::{WorkNodeKind, WorkNodeStatus};
use crate::ai::provider::ChatRequest;
use crate::ai::{self, BilledChatRequest};
use crate::soul::build_chat_parts_for_agent;
use crate::state::AppState;
use crate::workspace::storage::{company_workspace_root, WorkspaceStorage};
use tauri::{AppHandle, Manager};

pub struct PmReviewResult {
    pub approved: u32,
    pub rejected: u32,
    pub messages: Vec<String>,
}

pub fn approve_deliverable_core(state: &mut AppState, work_node_id: &str) -> Result<(), String> {
    let node = state
        .work_nodes
        .iter_mut()
        .find(|n| n.id == work_node_id)
        .ok_or_else(|| "Work node not found.".to_string())?;
    if node.status != WorkNodeStatus::InReview {
        return Err("Task is not awaiting review.".to_string());
    }
    node.status = WorkNodeStatus::Done;
    node.completed_at = Some(now_iso());
    node.updated_at = now_iso();
    let parent_id = node.parent_id.clone();
    let project_id = node.project_id.clone();

    if let Some(story_id) = parent_id {
        mark_story_done_if_tasks_complete(&mut state.work_nodes, &story_id);
    }
    let work_nodes = state.work_nodes.clone();
    recompute_project_progress(&mut state.projects, &work_nodes, &project_id);
    let _ = crate::operations::advance_gigs_on_work_delivered(state, 0);
    Ok(())
}

pub fn apply_pm_auto_review_tick(state: &mut AppState, app: &AppHandle) -> Option<PmReviewResult> {
    if !state.settings.scrum_auto_approve
        || state.settings.scrum_execution_paused
        || crate::autopilot::gates_deliverables(state)
    {
        return None;
    }

    let candidates: Vec<String> = state
        .work_nodes
        .iter()
        .filter(|n| n.kind == WorkNodeKind::Task && n.status == WorkNodeStatus::InReview)
        .map(|n| n.id.clone())
        .collect();

    if candidates.is_empty() {
        return None;
    }

    let mut result = PmReviewResult {
        approved: 0,
        rejected: 0,
        messages: Vec::new(),
    };

    for task_id in candidates {
        match review_task(state, app, &task_id) {
            Ok(true) => {
                if approve_deliverable_core(state, &task_id).is_ok() {
                    result.approved += 1;
                    result.messages.push(format!("PM approved {task_id}."));
                }
            }
            Ok(false) => {
                create_revision_task(state, &task_id, "PM requested revisions.");
                result.rejected += 1;
                result.messages.push(format!("PM rejected {task_id} — revision task created."));
            }
            Err(err) => {
                if state.settings.pure_local_mode || state.settings.ai_provider == "mock" {
                    if approve_deliverable_core(state, &task_id).is_ok() {
                        result.approved += 1;
                        result.messages.push(format!("Auto-approved {task_id} (local mode)."));
                    }
                } else {
                    result.messages.push(format!("PM review failed for {task_id}: {err}"));
                }
            }
        }
    }

    if result.approved == 0 && result.rejected == 0 && result.messages.is_empty() {
        None
    } else {
        Some(result)
    }
}

fn review_task(state: &mut AppState, app: &AppHandle, task_id: &str) -> Result<bool, String> {
    let (task, pm_id) = {
        let task = state
            .work_nodes
            .iter()
            .find(|n| n.id == task_id)
            .cloned()
            .ok_or_else(|| "Task not found.".to_string())?;
        let pm_id = task
            .owner_pm_agent_id
            .clone()
            .or_else(|| resolve_pm_agent_id(state, Some(&task.project_id)));
        (task, pm_id)
    };

    let pm_id = pm_id.ok_or_else(|| "No PM agent for review.".to_string())?;
    let pm = state
        .agents
        .get(&pm_id)
        .cloned()
        .ok_or_else(|| "PM agent not found.".to_string())?;

    let deliverable = read_deliverable_text(app, state, &task)?;
    let mut criteria_list = task.acceptance_criteria.clone();
    if criteria_list.is_empty() {
        if let Some(story_id) = &task.parent_id {
            if let Some(story) = state.work_nodes.iter().find(|n| n.id == *story_id) {
                if !story.acceptance_criteria.is_empty() {
                    criteria_list = story.acceptance_criteria.clone();
                } else if let Some(page_id) = &story.linked_workspace_page_id {
                    criteria_list =
                        crate::autopilot::brief_pages::extract_criteria_from_brief(app, state, page_id);
                }
            }
        }
    }
    if criteria_list.is_empty() {
        return Err("No acceptance criteria for PM review.".to_string());
    }
    let criteria = criteria_list.join("\n- ");

    if state.settings.pure_local_mode || state.settings.ai_provider == "mock" {
        return Ok(!deliverable.trim().is_empty());
    }

    let context = format!(
        "Review task deliverable.\nTask: {}\nDetails: {}\nAcceptance criteria:\n- {}\n\nDeliverable:\n{}",
        task.title, task.description, criteria, deliverable
    );
    let (persona, ctx) = build_chat_parts_for_agent(
        pm.soul.as_ref(),
        &pm.name,
        &pm.role,
        &pm.department,
        "PM quality review",
    );
    let request = ChatRequest {
        system_prompt: persona,
        context: Some(ctx),
        user_prompt: format!(
            "{context}\n\nReply with exactly APPROVE or REJECT on the first line, then a one-sentence rationale."
        ),
        temperature: 0.2,
        soul_id: pm.soul_id,
        conversation_turns: Vec::new(),
    };

    let dept_providers = state.department_ai_providers.clone();
    let response = ai::chat_with_fallback_billed(
        state,
        BilledChatRequest {
            request,
            agent_id: pm_id,
            department: pm.department.clone(),
            source: "pm_review".to_string(),
        },
        &dept_providers,
        pm.ai_provider.as_deref(),
    )?;

    let first_line = response.content.lines().next().unwrap_or("").to_uppercase();
    Ok(first_line.contains("APPROVE") && !first_line.contains("REJECT"))
}

fn create_revision_task(state: &mut AppState, task_id: &str, feedback: &str) {
    let (parent_id, project_id, title, department) = {
        let Some(task) = state.work_nodes.iter().find(|n| n.id == task_id) else {
            return;
        };
        (
            task.parent_id.clone(),
            task.project_id.clone(),
            task.title.clone(),
            task.department.clone(),
        )
    };

    if let Some(node) = state.work_nodes.iter_mut().find(|n| n.id == task_id) {
        node.status = WorkNodeStatus::Done;
        node.completed_at = Some(now_iso());
        node.updated_at = now_iso();
    }

    let revision_id = super::tree::new_node_id();
    let now = now_iso();
    state.work_nodes.push(super::types::WorkNode {
        id: revision_id,
        parent_id,
        project_id,
        kind: WorkNodeKind::Task,
        title: format!("Revision: {title}"),
        description: feedback.to_string(),
        status: WorkNodeStatus::Ready,
        priority: 5,
        story_points: 2,
        backlog_rank: 0,
        assignee_agent_id: None,
        assigned_by_manager_id: None,
        owner_pm_agent_id: state.default_pm_agent_id.clone(),
        retry_count: 0,
        department,
        sprint_id: None,
        depends_on: vec![task_id.to_string()],
        acceptance_criteria: vec![
            "Address PM feedback.".to_string(),
            "Updated deliverable in Workspace.".to_string(),
        ],
        linked_workspace_page_id: None,
        linked_gig_contract_id: None,
        awaiting_ceo_gate: false,
        created_at: now.clone(),
        updated_at: now,
        completed_at: None,
        queued_at: None,
    });
}

fn read_deliverable_text(app: &AppHandle, state: &AppState, task: &super::types::WorkNode) -> Result<String, String> {
    let page_id = task
        .linked_workspace_page_id
        .as_deref()
        .ok_or_else(|| "Task has no deliverable.".to_string())?;
    if state.company_id.is_empty() {
        return Err("Company not loaded.".to_string());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = WorkspaceStorage::new(company_workspace_root(&dir, &state.company_id))?;
    let page = storage.get_page(page_id)?;
    let text: String = page
        .blocks
        .iter()
        .map(|block| block.content.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    Ok(text)
}