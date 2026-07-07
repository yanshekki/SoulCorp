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

fn build_workspace_prompt_context(
    workspace_root: Option<&Path>,
    agent: &AgentRecord,
    search_query: &str,
) -> Option<String> {
    let root = workspace_root?;
    let storage = WorkspaceStorage::new(root.to_path_buf()).ok()?;
    storage.ensure_seed().ok()?;
    let service = AgentWorkspaceService::new(&storage);
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
    let workspace_context = build_workspace_prompt_context(
        workspace_root,
        agent,
        &format!("{project_title} {}", task.title),
    );
    let context = merge_chat_context(context, workspace_context);

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
            1 => step_template.replace("{plan}", &plan),
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
            0 => plan = response.content.clone(),
            1 => draft = response.content.clone(),
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
    let workspace_context = build_workspace_prompt_context(
        ctx.workspace_root.as_deref(),
        agent,
        &format!("{project_title} {}", task.title),
    );
    let context = merge_chat_context(context, workspace_context);

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
            1 => step_template.replace("{plan}", &plan),
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
            0 => plan = response.content.clone(),
            1 => draft = response.content.clone(),
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