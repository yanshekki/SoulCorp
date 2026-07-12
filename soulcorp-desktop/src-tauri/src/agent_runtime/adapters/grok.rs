use super::run_subprocess_for_agent;
use crate::agent_activity::ActivityRunContext;
use crate::agent_runtime::prompt_file::PromptFile;
use crate::agent_runtime::registry::prompt_delivery_for_adapter;
use crate::agent_runtime::security::{self, SubprocessRequest};
use crate::agent_runtime::types::RuntimeCatalogEntry;
use crate::agent_runtime::types::{RuntimeProbe, RuntimeResult};
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
    // No deep research dump for CLI — keeps prompt size reasonable.
    let workspace_addon = crate::scrum::agent_tools::workspace_prompt_addon(
        workspace_root,
        agent,
        project_title,
        task,
        false,
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

    // User-facing timeout (default/max 1 hour). Real kill enforced in security runner.
    let timeout_secs = settings.openclaw_timeout_secs.max(30).min(3600);

    let args = headless_argv(
        &prompt_file.path_str(),
        workspace_root,
        /* always_approve */ true,
    );

    let request = SubprocessRequest {
        binary,
        args,
        // Also set process cwd; --cwd flag is the source of truth for Grok workspace tools.
        cwd: workspace_root.map(|p| p.to_path_buf()),
        stdin: prompt_file.stdin_for(&delivery),
        timeout: Duration::from_secs(timeout_secs as u64),
        env_keys: grok_env(settings),
    };
    let output = run_subprocess_for_agent(state, &request, activity, &agent.id)?;
    // prompt_file Drop cleans temp dir after process exits
    drop(prompt_file);

    if output.exit_code.unwrap_or(1) != 0 {
        return Err(format!(
            "Grok CLI exited with {:?}: {}",
            output.exit_code, output.stderr
        ));
    }

    parse_grok_json(&output.stdout, output.duration_ms)
}

/// Argv for headless Grok (must match `format_execution_cli_command` preview).
///
/// Order matches Grok Build TUI: global flags, `--prompt-file PATH`, output/headless flags,
/// optional `--cwd` for workspace tools. Never puts the prompt body on argv.
pub fn headless_argv(
    prompt_file_path: &str,
    workspace_root: Option<&Path>,
    always_approve: bool,
) -> Vec<String> {
    let mut args = vec![
        "--no-auto-update".to_string(),
        "--prompt-file".to_string(),
        prompt_file_path.to_string(),
        "--output-format".to_string(),
        "json".to_string(),
        "--no-alt-screen".to_string(),
    ];
    if always_approve {
        // Unattended task runs must not hang on tool permission prompts.
        args.push("--always-approve".to_string());
        args.push("--permission-mode".to_string());
        args.push("dontAsk".to_string());
    }
    if let Some(cwd) = workspace_root {
        args.push("--cwd".to_string());
        args.push(cwd.display().to_string());
    }
    args
}

/// Shell-safe preview line for observability (prompt path is absolute or a clear placeholder).
pub fn headless_command_preview(
    binary: &str,
    prompt_file_path: &str,
    workspace_root: Option<&Path>,
    always_approve: bool,
) -> String {
    let args = headless_argv(prompt_file_path, workspace_root, always_approve);
    let mut parts = Vec::with_capacity(args.len() + 1);
    parts.push(shell_quote(binary));
    for arg in args {
        parts.push(shell_quote(&arg));
    }
    parts.join(" ")
}

fn shell_quote(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }
    if value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '/' | '.' | '_' | '-' | '=' | ':' | '+'))
    {
        return value.to_string();
    }
    format!("'{}'", value.replace('\'', "'\\''"))
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
            format!(
                "{} ready — headless via --prompt-file.",
                entry.label
            )
        } else {
            format!("{} binary found but headless CLI probe failed.", entry.label)
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_runtime::prompt_file::PromptDelivery;

    #[test]
    fn grok_args_use_prompt_file_not_body() {
        let delivery = PromptDelivery::from_adapter("grok_headless");
        let pf = PromptFile::write("grok-test", "FULL_BODY_SHOULD_NOT_BE_IN_ARGV").unwrap();
        let args = headless_argv(&pf.path_str(), Some(Path::new("/tmp/ws")), true);
        assert!(args.iter().any(|a| a == "--prompt-file"));
        assert!(args.iter().any(|a| a == "--always-approve"));
        assert!(args.iter().any(|a| a == "--cwd"));
        assert!(!args.iter().any(|a| a.contains("FULL_BODY")));
        assert!(!args.iter().any(|a| a == "-p" || a == "--single"));
        let _ = delivery;
    }

    #[test]
    fn headless_preview_quotes_paths_with_spaces() {
        let preview = headless_command_preview(
            "grok",
            "/tmp/soulcorp-cli/prompt.md",
            Some(Path::new("/home/user/My Company/workspace")),
            true,
        );
        assert!(preview.contains("--prompt-file"));
        assert!(preview.contains("'/home/user/My Company/workspace'") || preview.contains("My Company"));
        assert!(!preview.contains("$PROMPT_FILE"));
    }
}
