use super::run_subprocess_for_agent;
use crate::agent_activity::ActivityRunContext;
use crate::agent_runtime::security::{self, SubprocessRequest};
use crate::agent_runtime::task_prompt::build_compact_prompt;
use crate::agent_runtime::types::{RuntimeProbe, RuntimeResult};
use crate::agent_runtime::types::RuntimeCatalogEntry;
use crate::scrum::types::WorkNode;
use crate::state::{AgentRecord, AppState, GameSettings};
use serde_json::Value;
use std::path::Path;
use std::time::Duration;

pub fn probe(entry: &RuntimeCatalogEntry, settings: &GameSettings) -> RuntimeProbe {
    base_probe(entry, settings, &["--help"])
}

pub fn execute(
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
    let prompt = build_compact_prompt(task, agent, project_title, workspace_addon.as_deref());
    let timeout_secs = settings.openclaw_timeout_secs.max(30);

    let request = SubprocessRequest {
        binary,
        args: vec![
            "--no-auto-update".to_string(),
            "-p".to_string(),
            prompt,
            "--output-format".to_string(),
            "json".to_string(),
            "--no-alt-screen".to_string(),
        ],
        cwd: workspace_root.map(|p| p.to_path_buf()),
        stdin: None,
        timeout: Duration::from_secs(timeout_secs as u64),
        env_keys: grok_env(settings),
    };
    let output = run_subprocess_for_agent(state, &request, activity, &agent.id)?;

    if output.exit_code.unwrap_or(1) != 0 {
        return Err(format!(
            "Grok CLI exited with {:?}: {}",
            output.exit_code, output.stderr
        ));
    }

    parse_grok_json(&output.stdout, output.duration_ms)
}

fn grok_env(settings: &GameSettings) -> Vec<(String, String)> {
    if settings.agent_runtime_allow_cli_env_keys && !settings.grok_api_key.trim().is_empty() {
        vec![("XAI_API_KEY".to_string(), settings.grok_api_key.clone())]
    } else {
        vec![]
    }
}

fn parse_grok_json(stdout: &str, duration_ms: u64) -> Result<RuntimeResult, String> {
    let trimmed = stdout.trim();
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        if let Some(text) = extract_json_text(&value) {
            return Ok(RuntimeResult {
                content: text,
                transport: "grok-headless-json".to_string(),
                session_id: None,
                duration_ms,
            });
        }
    }

    if trimmed.is_empty() {
        return Err("Grok CLI returned empty output.".to_string());
    }

    Ok(RuntimeResult {
        content: trimmed.to_string(),
        transport: "grok-headless-text".to_string(),
        session_id: None,
        duration_ms,
    })
}

fn extract_json_text(value: &Value) -> Option<String> {
    if let Some(text) = value.get("text").and_then(|v| v.as_str()) {
        return Some(text.trim().to_string());
    }
    if let Some(response) = value.get("response").and_then(|v| v.as_str()) {
        return Some(response.trim().to_string());
    }
    if let Some(content) = value.get("content").and_then(|v| v.as_str()) {
        return Some(content.trim().to_string());
    }
    if let Some(messages) = value.get("messages").and_then(|v| v.as_array()) {
        let joined = messages
            .iter()
            .filter_map(|item| item.get("content").and_then(|v| v.as_str()))
            .collect::<Vec<_>>()
            .join("\n");
        if !joined.trim().is_empty() {
            return Some(joined);
        }
    }
    None
}

fn base_probe(
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
            format!("{} ready — headless mode available.", entry.label)
        } else {
            format!("{} binary found but headless CLI probe failed.", entry.label)
        },
    }
}