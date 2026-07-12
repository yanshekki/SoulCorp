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

/// PM auto-review that **never holds AppState across LLM HTTP**.
/// Prefer this from the worker loop.
pub fn apply_pm_auto_review_unlocked(app: &AppHandle) -> Option<PmReviewResult> {
    use crate::lock_util::MutexExt;
    use std::sync::Mutex;

    let state_mutex = app.state::<Mutex<AppState>>();

    let (candidates, max_revisions) = {
        let state = state_mutex.lock_or_recover().ok()?;
        if !state.settings.scrum_auto_approve
            || state.settings.scrum_execution_paused
            || crate::autopilot::gates_deliverables(&state)
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
        let max_revisions = state.settings.scrum_max_blocked_retries.max(1);
        (candidates, max_revisions)
    };

    let mut result = PmReviewResult {
        approved: 0,
        rejected: 0,
        messages: Vec::new(),
    };

    for task_id in candidates {
        // Cap / depth under short lock.
        let revision_depth = {
            let mut state = match state_mutex.lock_or_recover() {
                Ok(s) => s,
                Err(_) => continue,
            };
            let depth = state
                .work_nodes
                .iter()
                .find(|n| n.id == task_id)
                .map(|n| n.retry_count)
                .unwrap_or(0);
            if depth >= max_revisions {
                if approve_deliverable_core(&mut state, &task_id).is_ok() {
                    result.approved += 1;
                    result.messages.push(format!(
                        "PM reject cap reached for {task_id} (depth {depth}/{max_revisions}) — auto-approved to stop revision loop."
                    ));
                }
                continue;
            }
            depth
        };

        // Prepare review inputs under short lock, then LLM with no lock.
        let prepared = {
            let state = match state_mutex.lock_or_recover() {
                Ok(s) => s,
                Err(_) => continue,
            };
            prepare_review_inputs(&state, app, &task_id)
        };

        let decision = match prepared {
            Ok(inputs) => run_review_llm(inputs),
            Err(err) => Err((err, None)),
        };

        // Apply under short lock.
        let mut state = match state_mutex.lock_or_recover() {
            Ok(s) => s,
            Err(_) => continue,
        };
        match decision {
            Ok((ReviewDecision::Approve, charge)) => {
                if let Some(charge) = charge {
                    let _ = crate::token_budget::charge_tokens(&mut state, charge);
                }
                if approve_deliverable_core(&mut state, &task_id).is_ok() {
                    result.approved += 1;
                    result.messages.push(format!("PM approved {task_id}."));
                }
            }
            Ok((ReviewDecision::Reject { rationale }, charge)) => {
                if let Some(charge) = charge {
                    let _ = crate::token_budget::charge_tokens(&mut state, charge);
                }
                create_revision_task(&mut state, &task_id, &rationale, revision_depth);
                result.rejected += 1;
                result.messages.push(format!(
                    "PM rejected {task_id} (revision {}/{max_revisions}) — {rationale}",
                    revision_depth + 1
                ));
            }
            Err((err, _)) => {
                let has_body = task_has_nonempty_deliverable(app, &state, &task_id);
                if !has_body && revision_depth < max_revisions {
                    create_revision_task(
                        &mut state,
                        &task_id,
                        &format!("PM review failed ({err}); empty or missing deliverable."),
                        revision_depth,
                    );
                    result.rejected += 1;
                    result.messages.push(format!(
                        "PM review failed for {task_id} (empty deliverable) — revision {}/{max_revisions}: {err}",
                        revision_depth + 1
                    ));
                } else if approve_deliverable_core(&mut state, &task_id).is_ok() {
                    result.approved += 1;
                    result.messages.push(format!(
                        "PM review failed for {task_id} — auto-approved so automation continues: {err}"
                    ));
                } else {
                    result
                        .messages
                        .push(format!("PM review failed for {task_id}: {err}"));
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

/// Legacy entry: still works but may hold a caller-held lock during LLM.
/// Prefer [`apply_pm_auto_review_unlocked`].
pub fn apply_pm_auto_review_tick(state: &mut AppState, app: &AppHandle) -> Option<PmReviewResult> {
    // Cap-only path without network when possible; otherwise use unlocked via app.
    let _ = state;
    apply_pm_auto_review_unlocked(app)
}

enum ReviewDecision {
    Approve,
    Reject { rationale: String },
}

struct ReviewInputs {
    pure_local_or_mock: bool,
    deliverable: String,
    task_title: String,
    task_department: String,
    request: ChatRequest,
    settings: crate::state::GameSettings,
    hub: crate::state::HubState,
    dept_providers: std::collections::HashMap<String, String>,
    pm_id: String,
    pm_department: String,
    pm_provider: Option<String>,
}

fn prepare_review_inputs(
    state: &AppState,
    app: &AppHandle,
    task_id: &str,
) -> Result<ReviewInputs, String> {
    let task = state
        .work_nodes
        .iter()
        .find(|n| n.id == task_id)
        .cloned()
        .ok_or_else(|| "Task not found.".to_string())?;
    let pm_id = task
        .owner_pm_agent_id
        .clone()
        .or_else(|| resolve_pm_agent_id(state, Some(&task.project_id)))
        .ok_or_else(|| "No PM agent for review.".to_string())?;
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
            "{context}\n\n\
You are doing a light PM ship-check, not a perfection review.\n\
Approve unless the deliverable is empty, off-topic, or clearly fails a stated criterion.\n\
Prefer APPROVE for reasonable drafts that address the task.\n\
\n\
Hard REJECT (even if long):\n\
- Process-only chatter: “I'll review…”, “先檢視工作區…”, planning to work without results.\n\
- Implementation/code tasks whose body has no real source evidence (no file paths, no code fences, no tests) and only docs/meta notes.\n\
- Empty or placeholder intent with no work product.\n\
\n\
Reply with exactly APPROVE or REJECT as the first word on the first line, then one short rationale sentence."
        ),
        temperature: 0.2,
        soul_id: pm.soul_id,
        conversation_turns: Vec::new(),
    };

    Ok(ReviewInputs {
        pure_local_or_mock: state.settings.pure_local_mode
            || state.settings.ai_provider == "mock",
        deliverable,
        task_title: task.title,
        task_department: task.department,
        request,
        settings: state.settings.clone(),
        hub: state.hub.clone(),
        dept_providers: state.department_ai_providers.clone(),
        pm_id,
        pm_department: pm.department.clone(),
        pm_provider: pm.ai_provider.clone(),
    })
}

/// Local quality gate before/alongside LLM — catches empty + process-only noise.
fn local_deliverable_gate(inputs: &ReviewInputs) -> Option<ReviewDecision> {
    use crate::agent_runtime::task_prompt::{
        infer_task_work_mode, looks_like_process_chatter, TaskWorkMode,
    };
    use crate::scrum::types::{WorkNode, WorkNodeKind, WorkNodeStatus};

    if inputs.deliverable.trim().is_empty() {
        return Some(ReviewDecision::Reject {
            rationale: "Empty deliverable.".into(),
        });
    }
    if looks_like_process_chatter(&inputs.deliverable) {
        return Some(ReviewDecision::Reject {
            rationale: "Deliverable is process chatter only (no real work product).".into(),
        });
    }

    // Synthetic node for mode inference (only title/description/department matter).
    let probe = WorkNode {
        id: String::new(),
        parent_id: None,
        project_id: String::new(),
        kind: WorkNodeKind::Task,
        title: inputs.task_title.clone(),
        description: String::new(),
        status: WorkNodeStatus::InReview,
        priority: 3,
        story_points: 0,
        backlog_rank: 0,
        assignee_agent_id: None,
        assigned_by_manager_id: None,
        owner_pm_agent_id: None,
        retry_count: 0,
        department: inputs.task_department.clone(),
        sprint_id: None,
        depends_on: vec![],
        acceptance_criteria: vec![],
        linked_workspace_page_id: None,
        linked_gig_contract_id: None,
        awaiting_ceo_gate: false,
        created_at: String::new(),
        updated_at: String::new(),
        completed_at: None,
        queued_at: None,
    };
    if infer_task_work_mode(&probe, &inputs.task_department) == TaskWorkMode::ImplementCode {
        let d = inputs.deliverable.to_ascii_lowercase();
        let has_code_signal = inputs.deliverable.contains("```")
            || d.contains("src/")
            || d.contains(".py")
            || d.contains(".rs")
            || d.contains(".ts")
            || d.contains(".tsx")
            || d.contains("files written")
            || d.contains("files modified")
            || d.contains("ysk-restaurant/");
        if !has_code_signal {
            return Some(ReviewDecision::Reject {
                rationale: "Implementation task needs real code evidence (file paths or code), not docs-only."
                    .into(),
            });
        }
    }
    None
}

fn run_review_llm(
    inputs: ReviewInputs,
) -> Result<(ReviewDecision, Option<crate::token_budget::ChargeContext>), (String, Option<crate::token_budget::ChargeContext>)>
{
    if let Some(decision) = local_deliverable_gate(&inputs) {
        return Ok((decision, None));
    }

    if inputs.pure_local_or_mock {
        return Ok((ReviewDecision::Approve, None));
    }

    let (response, charge) = ai::chat_detached(
        &inputs.settings,
        &inputs.hub,
        &inputs.dept_providers,
        BilledChatRequest {
            request: inputs.request,
            agent_id: inputs.pm_id.clone(),
            department: inputs.pm_department.clone(),
            source: "pm_review".to_string(),
        },
        inputs.pm_provider.as_deref(),
    )
    .map_err(|e| (e, None))?;
    Ok((parse_review_response(&response.content), charge))
}

/// Parse PM model output: first token APPROVE/REJECT, rest is rationale.
fn parse_review_response(content: &str) -> ReviewDecision {
    let first_line = content.lines().next().unwrap_or("").trim();
    let mut parts = first_line.split_whitespace();
    let head = parts.next().unwrap_or("").to_ascii_uppercase();
    let rationale = {
        let rest = parts.collect::<Vec<_>>().join(" ");
        let body = if rest.is_empty() {
            content
                .lines()
                .skip(1)
                .map(str::trim)
                .find(|l| !l.is_empty())
                .unwrap_or("No rationale.")
                .to_string()
        } else {
            rest
        };
        body.chars().take(280).collect::<String>()
    };

    // Only treat explicit leading REJECT as reject — avoid "…APPROVE…REJECT…" false negatives.
    if head.starts_with("REJECT") {
        ReviewDecision::Reject { rationale }
    } else if head.starts_with("APPROVE") {
        ReviewDecision::Approve
    } else if first_line.to_ascii_uppercase().contains("REJECT")
        && !first_line.to_ascii_uppercase().contains("APPROVE")
    {
        ReviewDecision::Reject { rationale }
    } else {
        // Ambiguous / prose-only: ship rather than infinite revision loop.
        ReviewDecision::Approve
    }
}

fn create_revision_task(
    state: &mut AppState,
    task_id: &str,
    feedback: &str,
    previous_depth: u8,
) {
    let (
        parent_id,
        project_id,
        title,
        department,
        prev_assignee,
        owner_pm,
        assigned_by,
        sprint_id,
        criteria,
    ) = {
        let Some(task) = state.work_nodes.iter().find(|n| n.id == task_id) else {
            return;
        };
        // Prefer parent story sprint so revision stays on the active board.
        let parent_sprint = task
            .parent_id
            .as_ref()
            .and_then(|pid| {
                state
                    .work_nodes
                    .iter()
                    .find(|n| n.id == *pid)
                    .and_then(|n| n.sprint_id.clone())
            });
        (
            task.parent_id.clone(),
            task.project_id.clone(),
            task.title.clone(),
            task.department.clone(),
            task.assignee_agent_id.clone(),
            task.owner_pm_agent_id
                .clone()
                .or_else(|| state.default_pm_agent_id.clone()),
            task.assigned_by_manager_id.clone(),
            task.sprint_id.clone().or(parent_sprint),
            task.acceptance_criteria.clone(),
        )
    };

    if let Some(node) = state.work_nodes.iter_mut().find(|n| n.id == task_id) {
        node.status = WorkNodeStatus::Done;
        node.completed_at = Some(now_iso());
        node.updated_at = now_iso();
    }

    let revision_id = super::tree::new_node_id();
    let now = now_iso();
    let next_depth = previous_depth.saturating_add(1);
    let lang = crate::i18n::language_from_settings(&state.settings);
    let mut acceptance = vec![
        crate::i18n::address_pm_feedback_line(lang, feedback),
        crate::i18n::updated_deliverable_criterion(lang),
    ];
    // If the failed task was implementation-shaped, force code evidence on the next try.
    {
        use crate::agent_runtime::task_prompt::{infer_task_work_mode, TaskWorkMode};
        use crate::scrum::types::{WorkNode, WorkNodeKind, WorkNodeStatus};
        let probe = WorkNode {
            id: String::new(),
            parent_id: None,
            project_id: project_id.clone(),
            kind: WorkNodeKind::Task,
            title: title.clone(),
            description: String::new(),
            status: WorkNodeStatus::Ready,
            priority: 3,
            story_points: 0,
            backlog_rank: 0,
            assignee_agent_id: None,
            assigned_by_manager_id: None,
            owner_pm_agent_id: None,
            retry_count: 0,
            department: department.clone(),
            sprint_id: None,
            depends_on: vec![],
            acceptance_criteria: vec![],
            linked_workspace_page_id: None,
            linked_gig_contract_id: None,
            awaiting_ceo_gate: false,
            created_at: String::new(),
            updated_at: String::new(),
            completed_at: None,
            queued_at: None,
        };
        if infer_task_work_mode(&probe, &department) == TaskWorkMode::ImplementCode {
            match lang {
                crate::i18n::AppLanguage::En => {
                    acceptance.push(
                        "Ship real source under the company workspace project tree (list file paths)."
                            .into(),
                    );
                    acceptance.push(
                        "Do not submit process-only notes (“I'll review…”) as the deliverable."
                            .into(),
                    );
                }
                crate::i18n::AppLanguage::ZhHant => {
                    acceptance.push("在公司工作區專案樹交付真實原始碼（列出檔案路徑）。".into());
                    acceptance
                        .push("不可只交過程描述（例如「先檢視工作區…」）作為交付物。".into());
                }
                crate::i18n::AppLanguage::ZhHans => {
                    acceptance.push("在公司工作区项目树交付真实源码（列出文件路径）。".into());
                    acceptance
                        .push("不可只交过程描述（例如「先查看工作区…」）作为交付物。".into());
                }
            }
        }
    }
    for c in criteria.into_iter().take(4) {
        if !c.trim().is_empty() && !acceptance.iter().any(|a| a == &c) {
            acceptance.push(c);
        }
    }

    let mut revision = super::types::WorkNode {
        id: revision_id,
        parent_id,
        project_id,
        kind: WorkNodeKind::Task,
        title: super::tree::revision_task_title_lang(&title, lang),
        description: crate::i18n::pm_revision_description(lang, next_depth, feedback),
        // Keep in sprint so plan/execute pick it up; Ready alone was stranding work.
        status: if sprint_id.is_some() {
            WorkNodeStatus::InSprint
        } else {
            WorkNodeStatus::Ready
        },
        priority: 5,
        story_points: 2,
        backlog_rank: 0,
        assignee_agent_id: None,
        assigned_by_manager_id: assigned_by,
        owner_pm_agent_id: owner_pm,
        retry_count: next_depth,
        department,
        sprint_id,
        depends_on: vec![task_id.to_string()],
        acceptance_criteria: acceptance,
        linked_workspace_page_id: None,
        linked_gig_contract_id: None,
        awaiting_ceo_gate: false,
        created_at: now.clone(),
        updated_at: now,
        completed_at: None,
        queued_at: None,
    };

    // Prefer the agent who did the original work so revision is never orphaned.
    if let Some(agent_id) = prev_assignee.filter(|id| state.agents.contains_key(id)) {
        super::queue::assign_and_enqueue(&mut revision, agent_id);
    }

    state.work_nodes.push(revision);
}

fn task_has_nonempty_deliverable(app: &AppHandle, state: &AppState, task_id: &str) -> bool {
    let Some(task) = state.work_nodes.iter().find(|n| n.id == task_id) else {
        return false;
    };
    match read_deliverable_text(app, state, task) {
        Ok(text) => !text.trim().is_empty(),
        Err(_) => false,
    }
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

#[cfg(test)]
mod tests {
    use super::parse_review_response;
    use super::ReviewDecision;

    #[test]
    fn parse_approve_and_reject() {
        match parse_review_response("APPROVE Looks good enough to ship.") {
            ReviewDecision::Approve => {}
            _ => panic!("expected approve"),
        }
        match parse_review_response("REJECT Missing acceptance criteria coverage.") {
            ReviewDecision::Reject { rationale } => {
                assert!(rationale.to_lowercase().contains("missing"));
            }
            _ => panic!("expected reject"),
        }
        // Ambiguous prose should ship (stop revision storms).
        match parse_review_response("The deliverable could be improved but is usable.") {
            ReviewDecision::Approve => {}
            _ => panic!("expected approve on ambiguous"),
        }
    }
}
