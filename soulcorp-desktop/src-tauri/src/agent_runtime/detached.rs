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
            let subprocess_result = match activity.as_ref() {
                Some(act) => with_locked_state(act, |state| {
                    super::adapters::execute_runtime_for_id(
                        Some(state),
                        &runtime_id,
                        &ctx.settings,
                        &ctx.company_id,
                        task,
                        agent,
                        project_title,
                        ctx.workspace_root.as_deref(),
                        Some(act.clone()),
                    )
                }),
                None => super::adapters::execute_runtime_for_id(
                    None,
                    &runtime_id,
                    &ctx.settings,
                    &ctx.company_id,
                    task,
                    agent,
                    project_title,
                    ctx.workspace_root.as_deref(),
                    None,
                ),
            };
            match subprocess_result {
                Ok(result) => Ok(DetachedExecutionResult {
                    content: result.content,
                    provider: runtime_id.clone(),
                    charge: None,
                }),
                Err(err) => {
                    let label = crate::brain::effective_execution_label(&runtime_id);
                    if ctx.settings.agent_runtime_fallback_to_llm {
                        eprintln!("{label} runtime failed ({err}); falling back to LLM.");
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

fn with_locked_state<T>(
    activity: &ActivityRunContext,
    run: impl FnOnce(&mut AppState) -> Result<T, String>,
) -> Result<T, String> {
    let state_mutex = activity.app.state::<Mutex<AppState>>();
    let mut state = state_mutex
        .lock()
        .map_err(|error| format!("State lock poisoned: {error}"))?;
    run(&mut state)
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