//! Pluggable agent execution backends (in-process LLM, Claw subprocesses, etc.).

pub mod claw_kind;
pub mod detached;
mod llm;
pub mod openclaw;

use crate::scrum::types::WorkNode;
use crate::state::{AgentRecord, AppState};

pub use claw_kind::ClawRuntimeKind;
pub use llm::execute_llm_only;
pub use openclaw::execute_claw;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentRuntimeMode {
    LlmOnly,
    Claw(ClawRuntimeKind),
}

impl AgentRuntimeMode {
    pub fn from_setting(value: &str) -> Self {
        ClawRuntimeKind::from_setting(value)
            .map(Self::Claw)
            .unwrap_or(Self::LlmOnly)
    }

    pub fn is_claw_subprocess(self) -> bool {
        matches!(self, Self::Claw(_))
    }
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
                execute_llm_only(state, task, agent, project_title)
            }
        }
        AgentRuntimeMode::Claw(kind) => {
            match execute_claw(
                state,
                kind,
                task,
                agent,
                project_title,
                workspace_root.as_deref(),
            ) {
                Ok(content) => Ok(content),
                Err(err) => {
                    eprintln!(
                        "{} runtime failed ({err}); falling back to LLM.",
                        kind.display_name()
                    );
                    execute_llm_only(state, task, agent, project_title)
                }
            }
        }
    }
}