use super::types::WorkNode;
use crate::agent_runtime::detached::{DetachedExecutionResult, DetachedRuntimeContext};
use crate::ai::provider::ChatRequest;
use crate::ai::{self, BilledChatRequest};
use crate::soul::build_chat_parts_for_agent;
use crate::state::{AgentRecord, AppState};
use crate::workspace::{
    agent_service::{format_workspace_context_for_prompt, AgentContext, AgentWorkspaceService},
    WorkspaceStorage,
};
use std::path::Path;

const MAX_TOOL_STEPS: usize = 3;
const RESEARCH_PAGE_LIMIT: usize = 3;
const RESEARCH_SNIPPET_CHARS: usize = 700;
const JOURNAL_TITLE_MAX_CHARS: usize = 80;

struct WorkspaceExecution {
    storage: WorkspaceStorage,
}

impl WorkspaceExecution {
    fn open(root: &Path) -> Result<Self, String> {
        let storage = WorkspaceStorage::new(root.to_path_buf())?;
        storage.ensure_seed()?;
        Ok(Self { storage })
    }

    fn service(&self) -> AgentWorkspaceService<'_> {
        AgentWorkspaceService::new(&self.storage)
    }
}

fn journal_title_for_task(task: &WorkNode) -> String {
    let title = task.title.trim();
    if title.chars().count() <= JOURNAL_TITLE_MAX_CHARS {
        format!("Task — {title}")
    } else {
        format!(
            "Task — {}…",
            title.chars().take(JOURNAL_TITLE_MAX_CHARS).collect::<String>()
        )
    }
}

fn content_lines(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
        .collect()
}

fn truncate_for_prompt(text: &str, max_chars: usize) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= max_chars {
        trimmed.to_string()
    } else {
        format!(
            "{}…",
            trimmed.chars().take(max_chars).collect::<String>()
        )
    }
}

fn build_workspace_prompt_context(
    workspace_root: Option<&Path>,
    agent: &AgentRecord,
    search_query: &str,
) -> Option<String> {
    let root = workspace_root?;
    let execution = WorkspaceExecution::open(root).ok()?;
    let service = execution.service();
    let agent_ctx = AgentContext::from_record(agent);
    let mut parts = Vec::new();
    if let Ok(context) = service.get_context(&agent_ctx) {
        parts.push(format_workspace_context_for_prompt(&context));
    }
    let query = search_query.trim();
    if !query.is_empty() {
        if let Ok(results) = service.search(&agent_ctx, query, 5) {
            if !results.is_empty() {
                parts.push("Relevant workspace pages:".to_string());
                for result in results {
                    parts.push(format!(
                        "- {} [{}]: {}",
                        result.title, result.page_id, result.snippet
                    ));
                }
            }
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n"))
    }
}

fn gather_workspace_research(
    execution: &WorkspaceExecution,
    agent: &AgentRecord,
    query: &str,
) -> Option<String> {
    let service = execution.service();
    let agent_ctx = AgentContext::from_record(agent);
    let results = service.search(&agent_ctx, query, RESEARCH_PAGE_LIMIT).ok()?;
    if results.is_empty() {
        return None;
    }

    let mut parts = vec!["Workspace pages read for this task:".to_string()];
    for hit in results {
        match service.read_page(&agent_ctx, &hit.page_id) {
            Ok(page) => {
                parts.push(format!(
                    "### {} [{}]\n{}",
                    page.title,
                    page.page_id,
                    truncate_for_prompt(&page.text, RESEARCH_SNIPPET_CHARS)
                ));
            }
            Err(error) => {
                parts.push(format!("### {} [{}] (unreadable: {error})", hit.title, hit.page_id));
            }
        }
    }
    if parts.len() <= 1 {
        None
    } else {
        Some(parts.join("\n\n"))
    }
}

fn persist_execution_note(
    execution: &WorkspaceExecution,
    agent: &AgentRecord,
    task: &WorkNode,
    heading: &str,
    content: &str,
) {
    let lines = content_lines(content);
    if lines.is_empty() {
        return;
    }
    let service = execution.service();
    let agent_ctx = AgentContext::from_record(agent);
    let journal_title = journal_title_for_task(task);
    if let Err(error) = service.append_journal(&agent_ctx, &journal_title, heading, &lines) {
        eprintln!("Agent workspace journal write failed: {error}");
    }
}

fn append_research_to_prompt(base_prompt: String, research: Option<String>) -> String {
    match research {
        Some(body) => format!("{base_prompt}\n\n--- Workspace research ---\n{body}"),
        None => base_prompt,
    }
}

fn merge_chat_context(persona_context: String, workspace_context: Option<String>) -> Option<String> {
    match workspace_context {
        Some(workspace) => Some(format!("{persona_context}\n\n--- Workspace ---\n{workspace}")),
        None => {
            if persona_context.trim().is_empty() {
                None
            } else {
                Some(persona_context)
            }
        }
    }
}

fn task_search_query(project_title: &str, task: &WorkNode) -> String {
    format!("{project_title} {}", task.title)
}

/// Multi-step agent execution: plan → draft → refine before returning final deliverable.
pub fn execute_with_tools(
    state: &mut AppState,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
) -> Result<String, String> {
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
    let search_query = task_search_query(project_title, task);
    let workspace_context = build_workspace_prompt_context(workspace_root, agent, &search_query);
    let context = merge_chat_context(context, workspace_context);
    let workspace_exec = workspace_root.and_then(|root| WorkspaceExecution::open(root).ok());

    let mut transcript = String::new();
    let steps = [
        format!(
            "Step 1 — Plan: List 3-5 concrete steps to complete this task.\nTask: {}\nDetails: {}",
            task.title, task.description
        ),
        "Step 2 — Draft: Write the deliverable (summary, decisions, next steps) in markdown-friendly plain text.\nPrior plan:\n{plan}".to_string(),
        format!(
            "Step 3 — Refine: Polish the draft against acceptance criteria. Return ONLY the final deliverable text.\nCriteria:\n- {}\n\nDraft:\n{{draft}}",
            ac
        ),
    ];

    let mut plan = String::new();
    let mut draft = String::new();

    for (index, step_template) in steps.iter().enumerate().take(MAX_TOOL_STEPS) {
        let user_prompt = match index {
            0 => step_template.clone(),
            1 => {
                let base = step_template.replace("{plan}", &plan);
                let research = workspace_exec
                    .as_ref()
                    .and_then(|execution| gather_workspace_research(execution, agent, &search_query));
                append_research_to_prompt(base, research)
            }
            2 => step_template.replace("{draft}", &draft),
            _ => step_template.clone(),
        };

        let request = ChatRequest {
            system_prompt: persona.clone(),
            context: context.clone(),
            user_prompt,
            temperature: if index == 2 { 0.4 } else { 0.55 },
            soul_id: agent.soul_id,
            conversation_turns: Vec::new(),
        };

        let dept_providers = state.department_ai_providers.clone();
        let response = ai::chat_with_fallback_billed(
            state,
            BilledChatRequest {
                request,
                agent_id: agent.id.clone(),
                department: agent.department.clone(),
                source: format!("work_execution_tool_{}", index + 1),
            },
            &dept_providers,
            agent.ai_provider.as_deref(),
        )?;

        transcript.push_str(&response.content);
        transcript.push_str("\n---\n");

        match index {
            0 => {
                plan = response.content.clone();
                if let Some(execution) = workspace_exec.as_ref() {
                    persist_execution_note(
                        execution,
                        agent,
                        task,
                        &format!("Plan · {project_title}"),
                        &plan,
                    );
                }
            }
            1 => {
                draft = response.content.clone();
                if let Some(execution) = workspace_exec.as_ref() {
                    persist_execution_note(
                        execution,
                        agent,
                        task,
                        &format!("Draft · {project_title}"),
                        &draft,
                    );
                }
            }
            2 => return Ok(response.content),
            _ => {}
        }
    }

    Ok(if draft.is_empty() { transcript } else { draft })
}

pub fn execute_with_tools_detached(
    ctx: &DetachedRuntimeContext,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
) -> Result<DetachedExecutionResult, String> {
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
    let search_query = task_search_query(project_title, task);
    let workspace_context = build_workspace_prompt_context(ctx.workspace_root.as_deref(), agent, &search_query);
    let context = merge_chat_context(context, workspace_context);
    let workspace_exec = ctx
        .workspace_root
        .as_deref()
        .and_then(|root| WorkspaceExecution::open(root).ok());

    let steps = [
        format!(
            "Step 1 — Plan: List 3-5 concrete steps to complete this task.\nTask: {}\nDetails: {}",
            task.title, task.description
        ),
        "Step 2 — Draft: Write the deliverable (summary, decisions, next steps) in markdown-friendly plain text.\nPrior plan:\n{plan}".to_string(),
        format!(
            "Step 3 — Refine: Polish the draft against acceptance criteria. Return ONLY the final deliverable text.\nCriteria:\n- {}\n\nDraft:\n{{draft}}",
            ac
        ),
    ];

    let mut plan = String::new();
    let mut draft = String::new();
    let mut last_provider = "agent-tools".to_string();
    let mut charges = Vec::new();

    for (index, step_template) in steps.iter().enumerate().take(MAX_TOOL_STEPS) {
        let user_prompt = match index {
            0 => step_template.clone(),
            1 => {
                let base = step_template.replace("{plan}", &plan);
                let research = workspace_exec
                    .as_ref()
                    .and_then(|execution| gather_workspace_research(execution, agent, &search_query));
                append_research_to_prompt(base, research)
            }
            2 => step_template.replace("{draft}", &draft),
            _ => step_template.clone(),
        };

        let request = ChatRequest {
            system_prompt: persona.clone(),
            context: context.clone(),
            user_prompt,
            temperature: if index == 2 { 0.4 } else { 0.55 },
            soul_id: agent.soul_id,
            conversation_turns: Vec::new(),
        };

        let billed = BilledChatRequest {
            request,
            agent_id: agent.id.clone(),
            department: agent.department.clone(),
            source: format!("work_execution_tool_{}", index + 1),
        };

        let (response, charge) = ai::chat_detached(
            &ctx.settings,
            &ctx.hub,
            &ctx.department_providers,
            billed,
            agent.ai_provider.as_deref(),
        )?;
        last_provider = response.provider.clone();
        if let Some(charge) = charge {
            charges.push(charge);
        }

        match index {
            0 => {
                plan = response.content.clone();
                if let Some(execution) = workspace_exec.as_ref() {
                    persist_execution_note(
                        execution,
                        agent,
                        task,
                        &format!("Plan · {project_title}"),
                        &plan,
                    );
                }
            }
            1 => {
                draft = response.content.clone();
                if let Some(execution) = workspace_exec.as_ref() {
                    persist_execution_note(
                        execution,
                        agent,
                        task,
                        &format!("Draft · {project_title}"),
                        &draft,
                    );
                }
            }
            2 => {
                return Ok(DetachedExecutionResult {
                    content: response.content,
                    provider: last_provider,
                    charge: charges.last().cloned(),
                });
            }
            _ => {}
        }
    }

    Ok(DetachedExecutionResult {
        content: if draft.is_empty() { plan } else { draft },
        provider: last_provider,
        charge: charges.last().cloned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_lines_skips_blank_lines() {
        let lines = content_lines("alpha\n\n  beta  \n");
        assert_eq!(lines, vec!["alpha".to_string(), "beta".to_string()]);
    }

    #[test]
    fn journal_title_truncates_long_task_names() {
        let task = WorkNode {
            id: "task-1".to_string(),
            parent_id: None,
            project_id: "proj-1".to_string(),
            kind: super::super::types::WorkNodeKind::Task,
            title: "x".repeat(120),
            description: String::new(),
            status: super::super::types::WorkNodeStatus::Ready,
            priority: 1,
            story_points: 1,
            backlog_rank: 1,
            assignee_agent_id: None,
            assigned_by_manager_id: None,
            owner_pm_agent_id: None,
            retry_count: 0,
            department: "Engineering".to_string(),
            sprint_id: None,
            depends_on: vec![],
            acceptance_criteria: vec![],
            linked_workspace_page_id: None,
            linked_gig_contract_id: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
            completed_at: None,
        };
        let title = journal_title_for_task(&task);
        assert!(title.starts_with("Task — "));
        assert!(title.chars().count() <= JOURNAL_TITLE_MAX_CHARS + "Task — …".chars().count());
    }
}