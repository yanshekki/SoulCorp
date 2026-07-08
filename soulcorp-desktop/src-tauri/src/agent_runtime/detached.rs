use crate::ai::{self, BilledChatRequest};
use crate::scrum::agent_tools;
use crate::scrum::executor::build_execution_request_for_project;
use crate::scrum::types::WorkNode;
use crate::state::{AgentRecord, GameSettings, HubState};
use crate::token_budget::ChargeContext;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct DetachedRuntimeContext {
    pub settings: GameSettings,
    pub hub: HubState,
    pub department_providers: HashMap<String, String>,
    pub company_id: String,
    pub workspace_root: Option<std::path::PathBuf>,
}

#[derive(Debug, Clone)]
pub struct DetachedExecutionResult {
    pub content: String,
    pub provider: String,
    pub charge: Option<ChargeContext>,
}

pub fn execute_for_task_detached(
    ctx: &DetachedRuntimeContext,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
) -> Result<DetachedExecutionResult, String> {
    let mode = super::AgentRuntimeMode::from_setting(&ctx.settings.agent_runtime_mode);
    match mode {
        super::AgentRuntimeMode::LlmOnly => {
            if ctx.settings.scrum_use_agent_tools {
                agent_tools::execute_with_tools_detached(ctx, task, agent, project_title)
            } else {
                execute_llm_only_detached(ctx, task, agent, project_title)
            }
        }
        super::AgentRuntimeMode::Claw(kind) => {
            match super::openclaw::execute_claw_detached(ctx, kind, task, agent, project_title) {
                Ok(content) => Ok(DetachedExecutionResult {
                    content,
                    provider: kind.id().to_string(),
                    charge: None,
                }),
                Err(err) => {
                    eprintln!(
                        "{} runtime failed ({err}); falling back to LLM.",
                        kind.display_name()
                    );
                    execute_llm_only_detached(ctx, task, agent, project_title)
                }
            }
        }
    }
}

pub fn execute_llm_only_detached(
    ctx: &DetachedRuntimeContext,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
) -> Result<DetachedExecutionResult, String> {
    let request = build_execution_request_for_project(task, agent, project_title)?;
    let billed = BilledChatRequest {
        request,
        agent_id: agent.id.clone(),
        department: agent.department.clone(),
        source: "work_execution".to_string(),
    };
    let (response, charge) = ai::chat_detached(
        &ctx.settings,
        &ctx.hub,
        &ctx.department_providers,
        billed,
        agent.ai_provider.as_deref(),
    )?;
    Ok(DetachedExecutionResult {
        content: response.content,
        provider: response.provider,
        charge,
    })
}

