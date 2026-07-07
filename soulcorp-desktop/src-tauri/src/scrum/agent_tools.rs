use super::types::WorkNode;
use crate::agent_runtime::detached::{DetachedExecutionResult, DetachedRuntimeContext};
use crate::ai::provider::ChatRequest;
use crate::ai::{self, BilledChatRequest};
use crate::soul::build_chat_parts_for_agent;
use crate::state::{AgentRecord, AppState};

const MAX_TOOL_STEPS: usize = 3;

/// Multi-step agent execution: plan → draft → refine before returning final deliverable.
pub fn execute_with_tools(
    state: &mut AppState,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
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

    let mut transcript = String::new();
    let steps = [
        format!(
            "Step 1 — Plan: List 3-5 concrete steps to complete this task.\nTask: {}\nDetails: {}",
            task.title, task.description
        ),
        format!(
            "Step 2 — Draft: Write the deliverable (summary, decisions, next steps) in markdown-friendly plain text.\nPrior plan:\n{{plan}}"
        ),
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
            context: Some(context.clone()),
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
            context: Some(context.clone()),
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