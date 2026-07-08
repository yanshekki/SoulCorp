//! Pluggable agent execution backends (in-app LLM, external CLI runtimes).

pub mod adapters;
pub mod openclaw;
pub mod registry;
pub mod security;
pub mod task_prompt;
pub mod types;

pub use registry::{active_runtime, catalog, is_subprocess_runtime, runtime_by_id};
pub use types::{RuntimeCatalog, RuntimeProbe, RuntimeProbeSummary, RuntimeResult};

use crate::scrum::types::WorkNode;
use crate::state::{AgentRecord, AppState};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentRuntimeMode {
    LlmOnly,
    Subprocess,
}

impl AgentRuntimeMode {
    pub fn from_setting(value: &str) -> Self {
        if is_subprocess_runtime(value) {
            Self::Subprocess
        } else {
            Self::LlmOnly
        }
    }
}

pub fn probe_active_runtime(settings: &crate::state::GameSettings) -> RuntimeProbe {
    adapters::probe_runtime(settings)
}

pub fn execute_for_task(
    state: &mut AppState,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<std::path::PathBuf>,
) -> Result<String, String> {
    let mode = AgentRuntimeMode::from_setting(&state.settings.agent_runtime_mode);
    match mode {
        AgentRuntimeMode::LlmOnly => {
            if state.settings.scrum_use_agent_tools {
                crate::scrum::agent_tools::execute_with_tools(
                    state,
                    task,
                    agent,
                    project_title,
                    workspace_root.as_deref(),
                )
            } else {
                llm::execute_llm_only(state, task, agent, project_title)
            }
        }
        AgentRuntimeMode::Subprocess => {
            match adapters::execute_runtime(
                &state.settings,
                &state.company_id,
                task,
                agent,
                project_title,
                workspace_root.as_deref(),
            ) {
                Ok(result) => Ok(result.content),
                Err(err) => {
                    let label = registry::effective_label(&state.settings);
                    if state.settings.agent_runtime_fallback_to_llm {
                        eprintln!("{label} runtime failed ({err}); falling back to LLM.");
                        llm::execute_llm_only(state, task, agent, project_title)
                    } else {
                        Err(err)
                    }
                }
            }
        }
    }
}

pub mod detached;
mod llm;

pub use llm::execute_llm_only;