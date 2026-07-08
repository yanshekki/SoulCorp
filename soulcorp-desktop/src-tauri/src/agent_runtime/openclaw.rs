//! Backward-compatible re-exports for legacy OpenClaw integration points.

pub use crate::agent_runtime::adapters::claw;
pub use crate::agent_runtime::registry::{active_runtime, is_subprocess_runtime};
pub use crate::agent_runtime::types::{ClawProbe, ClawRunResult, OpenClawProbe, RuntimeProbe, RuntimeResult};

pub fn probe_openclaw(settings: &crate::state::GameSettings) -> RuntimeProbe {
    crate::agent_runtime::probe_active_runtime(settings)
}

pub fn probe_claw(settings: &crate::state::GameSettings, entry: &crate::agent_runtime::types::RuntimeCatalogEntry) -> RuntimeProbe {
    claw::probe(entry, settings)
}

pub fn execute_openclaw(
    state: &crate::state::AppState,
    task: &crate::scrum::types::WorkNode,
    agent: &crate::state::AgentRecord,
    project_title: &str,
    workspace_root: Option<&std::path::Path>,
) -> Result<String, String> {
    crate::agent_runtime::adapters::execute_runtime(
        &state.settings,
        &state.company_id,
        task,
        agent,
        project_title,
        workspace_root,
    )
    .map(|result| result.content)
}

pub fn execute_claw(
    state: &crate::state::AppState,
    _kind: (),
    task: &crate::scrum::types::WorkNode,
    agent: &crate::state::AgentRecord,
    project_title: &str,
    workspace_root: Option<&std::path::Path>,
) -> Result<String, String> {
    execute_openclaw(state, task, agent, project_title, workspace_root)
}

pub fn execute_openclaw_detached(
    ctx: &crate::agent_runtime::detached::DetachedRuntimeContext,
    task: &crate::scrum::types::WorkNode,
    agent: &crate::state::AgentRecord,
    project_title: &str,
) -> Result<String, String> {
    crate::agent_runtime::adapters::execute_runtime(
        &ctx.settings,
        &ctx.company_id,
        task,
        agent,
        project_title,
        ctx.workspace_root.as_deref(),
    )
    .map(|result| result.content)
}

pub fn run_openclaw_for_task(
    settings: &crate::state::GameSettings,
    company_id: &str,
    task: &crate::scrum::types::WorkNode,
    agent: &crate::state::AgentRecord,
    project_title: &str,
    workspace_root: Option<&std::path::Path>,
) -> Result<RuntimeResult, String> {
    crate::agent_runtime::adapters::execute_runtime(
        settings,
        company_id,
        task,
        agent,
        project_title,
        workspace_root,
    )
}

pub fn resolve_openclaw_binary(settings: &crate::state::GameSettings) -> Result<String, String> {
    let entry = active_runtime(settings).ok_or_else(|| {
        "No subprocess runtime selected.".to_string()
    })?;
    let binary = if entry.id == "custom" {
        settings.agent_runtime_custom_binary.as_str()
    } else {
        entry.default_binary.as_str()
    };
    crate::agent_runtime::security::resolve_binary(
        &settings.openclaw_binary_path,
        binary,
        &entry.label,
    )
}