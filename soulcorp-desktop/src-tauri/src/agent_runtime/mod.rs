//! Pluggable agent execution backends (in-process LLM, OpenClaw subprocess, etc.).

pub mod detached;
mod llm;
pub mod openclaw;

use crate::scrum::types::WorkNode;
use crate::state::{AgentRecord, AppState};

pub use llm::execute_llm_only;
pub use openclaw::{execute_openclaw, probe_openclaw, OpenClawProbe};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentRuntimeMode {
    LlmOnly,
    OpenClaw,
}

impl AgentRuntimeMode {
    pub fn from_setting(value: &str) -> Self {
        match value.trim().to_lowercase().as_str() {
            "openclaw" => Self::OpenClaw,
            _ => Self::LlmOnly,
        }
    }
}

pub fn execute_for_task(
    state: &mut AppState,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
) -> Result<String, String> {
    let mode = AgentRuntimeMode::from_setting(&state.settings.agent_runtime_mode);
    match mode {
        AgentRuntimeMode::LlmOnly => {
            if state.settings.scrum_use_agent_tools {
                crate::scrum::agent_tools::execute_with_tools(state, task, agent, project_title)
            } else {
                execute_llm_only(state, task, agent, project_title)
            }
        }
        AgentRuntimeMode::OpenClaw => {
            match execute_openclaw(state, task, agent, project_title) {
                Ok(content) => Ok(content),
                Err(err) => {
                    eprintln!("OpenClaw runtime failed ({err}); falling back to LLM.");
                    execute_llm_only(state, task, agent, project_title)
                }
            }
        }
    }
}