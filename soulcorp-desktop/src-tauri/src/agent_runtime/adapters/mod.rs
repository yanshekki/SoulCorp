pub mod claw;
pub mod generic;
pub mod grok;

use crate::agent_activity::{emit_terminal_line, ActivityRunContext};
use crate::agent_runtime::registry::{active_runtime, active_runtime_for_id, effective_adapter_id};
use crate::agent_runtime::security::{self, SubprocessRequest, SubprocessOutput};
use crate::agent_runtime::types::{RuntimeProbe, RuntimeResult};
use crate::scrum::types::WorkNode;
use crate::state::{AgentRecord, AppState, GameSettings};
use std::path::Path;

pub fn probe_runtime_for_id(runtime_id: &str, settings: &GameSettings) -> RuntimeProbe {
    let Some(entry) = active_runtime_for_id(runtime_id) else {
        return RuntimeProbe {
            runtime_id: "llm_only".to_string(),
            runtime_label: "In-app LLM".to_string(),
            adapter: "builtin".to_string(),
            binary_path: String::new(),
            binary_available: true,
            version: None,
            agent_command_available: true,
            gateway_healthy: false,
            message: "Using in-app LLM execution.".to_string(),
        };
    };

    let custom_entry = custom_runtime_entry(settings, entry);
    dispatch_probe(&custom_entry, settings)
}

pub fn probe_runtime(settings: &GameSettings) -> RuntimeProbe {
    probe_runtime_for_id(&settings.agent_runtime_mode, settings)
}

pub fn run_subprocess_for_agent(
    state: Option<&mut AppState>,
    request: &SubprocessRequest,
    activity: Option<ActivityRunContext>,
    agent_id: &str,
) -> Result<SubprocessOutput, String> {
    if let (Some(state), Some(act)) = (state, activity) {
        security::run_subprocess_observed(request, &mut |stream, line| {
            emit_terminal_line(
                state,
                Some(&act.app),
                &act.session_id,
                agent_id,
                line,
                stream,
            );
        })
    } else {
        security::run_subprocess(request)
    }
}

pub fn execute_runtime_for_id(
    state: Option<&mut AppState>,
    runtime_id: &str,
    settings: &GameSettings,
    company_id: &str,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
    activity: Option<ActivityRunContext>,
) -> Result<RuntimeResult, String> {
    let entry = active_runtime_for_id(runtime_id).ok_or_else(|| {
        format!("No subprocess runtime selected for '{runtime_id}'.")
    })?;
    let custom_entry = custom_runtime_entry(settings, entry);
    let result = dispatch_execute(
        state,
        &custom_entry,
        settings,
        company_id,
        task,
        agent,
        project_title,
        workspace_root,
        activity,
    )?;

    crate::scrum::agent_tools::persist_task_deliverable_note(
        workspace_root,
        agent,
        task,
        project_title,
        &format!("{} deliverable", custom_entry.label),
        &result.content,
    );

    Ok(result)
}

pub fn execute_runtime(
    settings: &GameSettings,
    company_id: &str,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
) -> Result<RuntimeResult, String> {
    execute_runtime_for_id(
        None,
        &settings.agent_runtime_mode,
        settings,
        company_id,
        task,
        agent,
        project_title,
        workspace_root,
        None,
    )
}

fn custom_runtime_entry<'a>(
    settings: &GameSettings,
    entry: &'a crate::agent_runtime::types::RuntimeCatalogEntry,
) -> crate::agent_runtime::types::RuntimeCatalogEntry {
    if entry.id != "custom" {
        return entry.clone();
    }
    crate::agent_runtime::types::RuntimeCatalogEntry {
        id: entry.id.clone(),
        label: entry.label.clone(),
        category: entry.category.clone(),
        adapter: effective_adapter_id(settings).unwrap_or_else(|| "legacy_stdin".to_string()),
        default_binary: settings.agent_runtime_custom_binary.clone(),
        docs_url: entry.docs_url.clone(),
        capabilities: entry.capabilities.clone(),
        layers: entry.layers.clone(),
        transport: entry.transport.clone(),
        api_provider_id: entry.api_provider_id.clone(),
    }
}

fn dispatch_probe(
    entry: &crate::agent_runtime::types::RuntimeCatalogEntry,
    settings: &GameSettings,
) -> RuntimeProbe {
    match entry.adapter.as_str() {
        "claw_agent_cli" => claw::probe(entry, settings),
        "grok_headless" => grok::probe(entry, settings),
        "prompt_flag" => generic::probe_prompt_flag(entry, settings),
        "codex_noninteractive" => generic::probe_codex(entry, settings),
        "aider_message" => generic::probe_message_file(entry, settings),
        _ => generic::probe_legacy_stdin(entry, settings),
    }
}

fn dispatch_execute(
    state: Option<&mut AppState>,
    entry: &crate::agent_runtime::types::RuntimeCatalogEntry,
    settings: &GameSettings,
    company_id: &str,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
    activity: Option<ActivityRunContext>,
) -> Result<RuntimeResult, String> {
    match entry.adapter.as_str() {
        "claw_agent_cli" => {
            claw::execute(state, entry, settings, company_id, task, agent, project_title, workspace_root, activity)
        }
        "grok_headless" => {
            grok::execute(state, entry, settings, task, agent, project_title, workspace_root, activity)
        }
        "prompt_flag" => generic::execute_prompt_flag(
            state, entry, settings, task, agent, project_title, workspace_root, activity,
        ),
        "codex_noninteractive" => generic::execute_codex(
            state, entry, settings, task, agent, project_title, workspace_root, activity,
        ),
        "aider_message" => generic::execute_message_file(
            state, entry, settings, task, agent, project_title, workspace_root, activity,
        ),
        _ => generic::execute_legacy_stdin(
            state, entry, settings, task, agent, project_title, workspace_root, activity,
        ),
    }
}