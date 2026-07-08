use crate::agent_runtime::security::{self, SubprocessRequest};
use crate::agent_runtime::task_prompt::build_compact_prompt;
use crate::agent_runtime::types::{RuntimeProbe, RuntimeResult};
use crate::agent_runtime::types::RuntimeCatalogEntry;
use crate::scrum::types::WorkNode;
use crate::state::{AgentRecord, GameSettings};
use std::fs;
use std::path::Path;
use std::time::Duration;
use uuid::Uuid;

pub fn probe_prompt_flag(entry: &RuntimeCatalogEntry, settings: &GameSettings) -> RuntimeProbe {
    probe_with_help(entry, settings, &["--help"])
}

pub fn execute_prompt_flag(
    entry: &RuntimeCatalogEntry,
    settings: &GameSettings,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
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
    let prompt = build_compact_prompt(task, agent, project_title, workspace_addon.as_deref());
    let timeout_secs = settings.openclaw_timeout_secs.max(30);

    let output = security::run_subprocess(&SubprocessRequest {
        binary,
        args: vec![
            "-p".to_string(),
            prompt,
            "--output-format".to_string(),
            "text".to_string(),
        ],
        cwd: workspace_root.map(|p| p.to_path_buf()),
        stdin: None,
        timeout: Duration::from_secs(timeout_secs as u64),
        env_keys: vec![],
    })?;

    finish_plain_output(entry, output)
}

pub fn probe_codex(entry: &RuntimeCatalogEntry, settings: &GameSettings) -> RuntimeProbe {
    probe_with_help(entry, settings, &["--help"])
}

pub fn execute_codex(
    entry: &RuntimeCatalogEntry,
    settings: &GameSettings,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
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
    let prompt = build_compact_prompt(task, agent, project_title, workspace_addon.as_deref());
    let timeout_secs = settings.openclaw_timeout_secs.max(30);

    let output = security::run_subprocess(&SubprocessRequest {
        binary,
        args: vec!["exec".to_string(), prompt],
        cwd: workspace_root.map(|p| p.to_path_buf()),
        stdin: None,
        timeout: Duration::from_secs(timeout_secs as u64),
        env_keys: vec![],
    })?;

    finish_plain_output(entry, output)
}

pub fn probe_message_file(entry: &RuntimeCatalogEntry, settings: &GameSettings) -> RuntimeProbe {
    probe_with_help(entry, settings, &["--help"])
}

pub fn execute_message_file(
    entry: &RuntimeCatalogEntry,
    settings: &GameSettings,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
) -> Result<RuntimeResult, String> {
    let binary = security::resolve_binary(
        &settings.openclaw_binary_path,
        &entry.default_binary,
        &entry.label,
    )?;
    let temp_dir = std::env::temp_dir().join(format!("soulcorp-msg-{}-{}", entry.id, Uuid::new_v4()));
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let message_path = temp_dir.join("task.md");
    let workspace_addon = crate::scrum::agent_tools::workspace_prompt_addon(
        workspace_root,
        agent,
        project_title,
        task,
        true,
    );
    let prompt = build_compact_prompt(task, agent, project_title, workspace_addon.as_deref());
    fs::write(&message_path, prompt).map_err(|e| e.to_string())?;
    let timeout_secs = settings.openclaw_timeout_secs.max(30);

    let output = security::run_subprocess(&SubprocessRequest {
        binary,
        args: vec![
            "--message-file".to_string(),
            message_path.display().to_string(),
            "--yes".to_string(),
        ],
        cwd: workspace_root.map(|p| p.to_path_buf()),
        stdin: None,
        timeout: Duration::from_secs(timeout_secs as u64),
        env_keys: vec![],
    })?;

    let _ = fs::remove_dir_all(&temp_dir);
    finish_plain_output(entry, output)
}

pub fn probe_legacy_stdin(entry: &RuntimeCatalogEntry, settings: &GameSettings) -> RuntimeProbe {
    probe_with_help(entry, settings, &["--version"])
}

pub fn execute_legacy_stdin(
    entry: &RuntimeCatalogEntry,
    settings: &GameSettings,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
) -> Result<RuntimeResult, String> {
    crate::agent_runtime::adapters::claw::execute(
        entry, settings, "", task, agent, project_title, workspace_root,
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
            format!("{} ready — CLI detected.", entry.label)
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