use crate::agent_activity::ActivityRunContext;
use crate::ai::{self, BilledChatRequest};
use crate::scrum::agent_tools;
use crate::scrum::executor::build_execution_request_for_project;
use crate::scrum::types::WorkNode;
use crate::state::{AgentRecord, AppState, GameSettings, HubState};
use crate::token_budget::ChargeContext;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;

#[derive(Debug, Clone)]
pub struct DetachedRuntimeContext {
    pub settings: GameSettings,
    pub hub: HubState,
    pub department_providers: HashMap<String, String>,
    pub department_runtimes: HashMap<String, String>,
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
    activity: Option<ActivityRunContext>,
) -> Result<DetachedExecutionResult, String> {
    let runtime_id = crate::brain::resolve_execution_runtime(
        &ctx.settings,
        &ctx.department_runtimes,
        &agent.department,
        agent,
    );
    let mode = super::AgentRuntimeMode::from_setting(&runtime_id);
    match mode {
        super::AgentRuntimeMode::LlmOnly => {
            if ctx.settings.scrum_use_agent_tools {
                agent_tools::execute_with_tools_detached(ctx, task, agent, project_title, activity)
            } else {
                execute_llm_only_detached(ctx, task, agent, project_title)
            }
        }
        super::AgentRuntimeMode::Subprocess => {
            // NEVER hold AppState across the whole CLI/LLM subprocess — that froze the UI
            // for minutes. Streaming lines take short locks inside run_subprocess_for_agent.
            let subprocess_result = super::adapters::execute_runtime_for_id(
                None,
                &runtime_id,
                &ctx.settings,
                &ctx.company_id,
                task,
                agent,
                project_title,
                ctx.workspace_root.as_deref(),
                activity.clone(),
            );
            match subprocess_result {
                Ok(result) => Ok(DetachedExecutionResult {
                    content: result.content,
                    provider: runtime_id.clone(),
                    charge: None,
                }),
                Err(err) => {
                    let label = crate::brain::effective_execution_label(&runtime_id);
                    if ctx.settings.agent_runtime_fallback_to_llm {
                        crate::app_log::log_global(crate::app_log::LogLevel::Warn, crate::app_log::LogCategory::Ai, "agent_runtime_detached", format!("{label} runtime failed ({err}); falling back to LLM."), None);
                        if ctx.settings.scrum_use_agent_tools {
                            agent_tools::execute_with_tools_detached(
                                ctx,
                                task,
                                agent,
                                project_title,
                                activity,
                            )
                        } else {
                            execute_llm_only_detached(ctx, task, agent, project_title)
                        }
                    } else {
                        Err(err)
                    }
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
    let mut request = build_execution_request_for_project(task, agent, project_title)?;
    if let Some(root) = ctx.workspace_root.as_ref() {
        if let Ok(storage) = crate::workspace::WorkspaceStorage::new(root.clone()) {
            let max_chars = ctx.settings.agent_memory_max_chars.max(500) as usize;
            let mem = crate::workspace::agent_memory::prompt_memory_section(
                Some(&storage),
                agent,
                max_chars,
            );
            if !mem.trim().is_empty() {
                request.context = Some(match request.context {
                    Some(existing) => format!("{existing}{mem}"),
                    None => mem,
                });
            }
        }
    }
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