use super::run_subprocess_for_agent;
use crate::agent_activity::ActivityRunContext;
use crate::agent_runtime::prompt_file::PromptFile;
use crate::agent_runtime::registry::prompt_delivery_for_adapter;
use crate::agent_runtime::security::{self, SubprocessRequest};
use crate::agent_runtime::types::RuntimeCatalogEntry;
use crate::agent_runtime::types::{RuntimeProbe, RuntimeResult};
use crate::scrum::types::WorkNode;
use crate::state::{AgentRecord, AppState, GameSettings};
use std::path::Path;
use std::time::Duration;

pub fn probe_prompt_flag(entry: &RuntimeCatalogEntry, settings: &GameSettings) -> RuntimeProbe {
    probe_with_help(entry, settings, &["--help"])
}

/// CLIs that historically used `-p <prompt>` — now always write a temp file first.
pub fn execute_prompt_flag(
    state: Option<&mut AppState>,
    entry: &RuntimeCatalogEntry,
    settings: &GameSettings,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
    activity: Option<ActivityRunContext>,
) -> Result<RuntimeResult, String> {
    let binary = security::resolve_binary(
        &settings.openclaw_binary_path,
        &entry.default_binary,
        &entry.label,
    )?;
    let workspace_addon = crate::scrum::agent_tools::workspace_prompt_addon(
        workspace_root,
        agent,
        project_title,
        task,
        true,
    );
    let lang_block = crate::i18n::language_instruction(crate::i18n::language_from_settings(settings));
    let prompt = crate::agent_runtime::task_prompt::build_compact_prompt_lang(
        task,
        agent,
        project_title,
        workspace_addon.as_deref(),
        Some(&lang_block),
    );
    let delivery = prompt_delivery_for_adapter(&entry.adapter);
    let prompt_file = PromptFile::write(&entry.id, &prompt)?;
    let timeout_secs = settings.openclaw_timeout_secs.max(30);

    let mut args = prompt_file.delivery_args(&delivery);
    if args.is_empty() {
        // Fallback: still never put full body in argv — use stdin.
        args = vec!["--stdin".to_string()];
    }
    args.extend([
        "--output-format".to_string(),
        "text".to_string(),
    ]);

    let request = SubprocessRequest {
        binary,
        args,
        cwd: workspace_root.map(|p| p.to_path_buf()),
        stdin: prompt_file.stdin_for(&delivery),
        timeout: Duration::from_secs(timeout_secs as u64),
        env_keys: vec![],
    };
    let output = run_subprocess_for_agent(state, &request, activity, &agent.id)?;
    drop(prompt_file);

    finish_plain_output(entry, output)
}

pub fn probe_codex(entry: &RuntimeCatalogEntry, settings: &GameSettings) -> RuntimeProbe {
    probe_with_help(entry, settings, &["--help"])
}

/// Codex: materialize prompt to file for observability; pass body via stdin (never argv).
pub fn execute_codex(
    state: Option<&mut AppState>,
    entry: &RuntimeCatalogEntry,
    settings: &GameSettings,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
    activity: Option<ActivityRunContext>,
) -> Result<RuntimeResult, String> {
    let binary = security::resolve_binary(
        &settings.openclaw_binary_path,
        &entry.default_binary,
        &entry.label,
    )?;
    let workspace_addon = crate::scrum::agent_tools::workspace_prompt_addon(
        workspace_root,
        agent,
        project_title,
        task,
        true,
    );
    let lang_block = crate::i18n::language_instruction(crate::i18n::language_from_settings(settings));
    let prompt = crate::agent_runtime::task_prompt::build_compact_prompt_lang(
        task,
        agent,
        project_title,
        workspace_addon.as_deref(),
        Some(&lang_block),
    );
    let prompt_file = PromptFile::write(&entry.id, &prompt)?;
    let timeout_secs = settings.openclaw_timeout_secs.max(30);

    // File is on disk for debug/View CLI; process reads body from stdin.
    let request = SubprocessRequest {
        binary,
        args: vec!["exec".to_string()],
        cwd: workspace_root.map(|p| p.to_path_buf()),
        stdin: Some(prompt_file.body.clone()),
        timeout: Duration::from_secs(timeout_secs as u64),
        env_keys: vec![],
    };
    let output = run_subprocess_for_agent(state, &request, activity, &agent.id)?;
    drop(prompt_file);

    finish_plain_output(entry, output)
}

pub fn probe_message_file(entry: &RuntimeCatalogEntry, settings: &GameSettings) -> RuntimeProbe {
    probe_with_help(entry, settings, &["--help"])
}

pub fn execute_message_file(
    state: Option<&mut AppState>,
    entry: &RuntimeCatalogEntry,
    settings: &GameSettings,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
    activity: Option<ActivityRunContext>,
) -> Result<RuntimeResult, String> {
    let binary = security::resolve_binary(
        &settings.openclaw_binary_path,
        &entry.default_binary,
        &entry.label,
    )?;
    let workspace_addon = crate::scrum::agent_tools::workspace_prompt_addon(
        workspace_root,
        agent,
        project_title,
        task,
        true,
    );
    let lang_block = crate::i18n::language_instruction(crate::i18n::language_from_settings(settings));
    let prompt = crate::agent_runtime::task_prompt::build_compact_prompt_lang(
        task,
        agent,
        project_title,
        workspace_addon.as_deref(),
        Some(&lang_block),
    );
    let delivery = prompt_delivery_for_adapter(&entry.adapter);
    let prompt_file = PromptFile::write(&entry.id, &prompt)?;
    let timeout_secs = settings.openclaw_timeout_secs.max(30);

    let mut args = prompt_file.delivery_args(&delivery);
    args.push("--yes".to_string());

    let request = SubprocessRequest {
        binary,
        args,
        cwd: workspace_root.map(|p| p.to_path_buf()),
        stdin: prompt_file.stdin_for(&delivery),
        timeout: Duration::from_secs(timeout_secs as u64),
        env_keys: vec![],
    };
    let output = run_subprocess_for_agent(state, &request, activity, &agent.id)?;
    drop(prompt_file);

    finish_plain_output(entry, output)
}

pub fn probe_legacy_stdin(entry: &RuntimeCatalogEntry, settings: &GameSettings) -> RuntimeProbe {
    probe_with_help(entry, settings, &["--version"])
}

pub fn execute_legacy_stdin(
    state: Option<&mut AppState>,
    entry: &RuntimeCatalogEntry,
    settings: &GameSettings,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
    activity: Option<ActivityRunContext>,
) -> Result<RuntimeResult, String> {
    crate::agent_runtime::adapters::claw::execute(
        state,
        entry,
        settings,
        "",
        task,
        agent,
        project_title,
        workspace_root,
        activity,
    )
}

fn probe_with_help(
    entry: &RuntimeCatalogEntry,
    settings: &GameSettings,
    help_args: &[&str],
) -> RuntimeProbe {
    let binary_path = match security::resolve_binary(
        &settings.openclaw_binary_path,
        &entry.default_binary,
        &entry.label,
    ) {
        Ok(path) => path,
        Err(message) => {
            return RuntimeProbe {
                runtime_id: entry.id.clone(),
                runtime_label: entry.label.clone(),
                adapter: entry.adapter.clone(),
                binary_path: settings.openclaw_binary_path.clone(),
                binary_available: false,
                version: None,
                agent_command_available: false,
                gateway_healthy: false,
                message,
            };
        }
    };

    let version = security::command_stdout(&binary_path, &["--version"]).ok();
    let agent_command_available = security::command_succeeds(&binary_path, help_args);

    RuntimeProbe {
        runtime_id: entry.id.clone(),
        runtime_label: entry.label.clone(),
        adapter: entry.adapter.clone(),
        binary_path,
        binary_available: true,
        version,
        agent_command_available,
        gateway_healthy: false,
        message: if agent_command_available {
            format!("{} ready — CLI detected (prompt via temp file).", entry.label)
        } else {
            format!("{} binary found but CLI probe failed.", entry.label)
        },
    }
}

fn finish_plain_output(
    entry: &RuntimeCatalogEntry,
    output: security::SubprocessOutput,
) -> Result<RuntimeResult, String> {
    if output.exit_code.unwrap_or(1) != 0 {
        return Err(format!(
            "{} exited with {:?}: {}",
            entry.label, output.exit_code, output.stderr
        ));
    }
    let content = output.stdout.trim().to_string();
    if content.is_empty() {
        return Err(format!("{} returned empty output.", entry.label));
    }
    Ok(RuntimeResult {
        content,
        transport: format!("{}-headless", entry.adapter),
        session_id: None,
        duration_ms: output.duration_ms,
    })
}
