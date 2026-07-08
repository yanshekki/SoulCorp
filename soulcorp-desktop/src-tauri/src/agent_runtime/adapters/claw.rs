use crate::agent_runtime::security::{self, SubprocessRequest};
use crate::agent_runtime::task_prompt::{build_task_message, materialize_soul_file, resolve_agent_id};
use crate::agent_runtime::types::{RuntimeProbe, RuntimeResult};
use crate::agent_runtime::types::RuntimeCatalogEntry;
use crate::scrum::types::WorkNode;
use crate::state::{AgentRecord, GameSettings};
use serde::Deserialize;
use std::fs;
use std::path::Path;
use std::time::{Duration, Instant};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
struct ClawJsonResponse {
    #[serde(default)]
    payloads: Vec<ClawJsonPayload>,
    meta: Option<ClawJsonMeta>,
    #[serde(default)]
    error: Option<String>,
    text: Option<String>,
    response: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ClawJsonPayload {
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ClawJsonMeta {
    transport: Option<String>,
    session_id: Option<String>,
    duration_ms: Option<u64>,
}

pub fn probe(entry: &RuntimeCatalogEntry, settings: &GameSettings) -> RuntimeProbe {
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
    let agent_command_available =
        security::command_succeeds(&binary_path, &["agent", "--help"]);
    let gateway_healthy = if settings.openclaw_prefer_gateway && agent_command_available {
        security::command_succeeds(&binary_path, &["gateway", "health"])
    } else {
        false
    };

    let message = if !agent_command_available {
        format!(
            "{} binary found, but `{} agent` is unavailable. Legacy stdin mode may still work.",
            entry.label, entry.default_binary
        )
    } else if settings.openclaw_prefer_gateway && gateway_healthy {
        format!("{} ready — gateway healthy.", entry.label)
    } else if settings.openclaw_use_local {
        format!("{} ready — local embedded agent mode.", entry.label)
    } else {
        format!("{} ready.", entry.label)
    };

    RuntimeProbe {
        runtime_id: entry.id.clone(),
        runtime_label: entry.label.clone(),
        adapter: entry.adapter.clone(),
        binary_path,
        binary_available: true,
        version,
        agent_command_available,
        gateway_healthy,
        message,
    }
}

pub fn execute(
    entry: &RuntimeCatalogEntry,
    settings: &GameSettings,
    company_id: &str,
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
    let probe = probe(entry, settings);
    if probe.agent_command_available {
        run_agent_cli(
            entry,
            settings,
            &binary,
            company_id,
            task,
            agent,
            project_title,
            workspace_root,
        )
    } else {
        run_legacy_stdin(entry, &binary, task, agent, project_title, workspace_root)
    }
}

fn run_agent_cli(
    entry: &RuntimeCatalogEntry,
    settings: &GameSettings,
    binary: &str,
    company_id: &str,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
) -> Result<RuntimeResult, String> {
    let started = Instant::now();
    let temp_dir = std::env::temp_dir().join(format!("soulcorp-{}-{}", entry.id, Uuid::new_v4()));
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let message_path = temp_dir.join("task.md");
    let soul_path = materialize_soul_file(&temp_dir, agent, workspace_root)?;
    let workspace_addon = crate::scrum::agent_tools::workspace_prompt_addon(
        workspace_root,
        agent,
        project_title,
        task,
        true,
    );
    let message = build_task_message(
        task,
        agent,
        project_title,
        soul_path.as_deref(),
        workspace_addon.as_deref(),
    );
    fs::write(&message_path, message).map_err(|e| e.to_string())?;

    let agent_id = resolve_agent_id(&settings.openclaw_default_agent_id, agent);
    let session_key = if company_id.is_empty() {
        None
    } else {
        Some(format!(
            "agent:{agent_id}:soulcorp-{company_id}-{}",
            task.id
        ))
    };

    let timeout_secs = settings.openclaw_timeout_secs.max(30);
    let mut args = vec![
        "agent".to_string(),
        "--agent".to_string(),
        agent_id,
        "--message-file".to_string(),
        message_path.display().to_string(),
        "--json".to_string(),
        "--timeout".to_string(),
        timeout_secs.to_string(),
        "--no-color".to_string(),
    ];

    if let Some(session_key) = session_key {
        args.push("--session-key".to_string());
        args.push(session_key);
    }

    if settings.openclaw_use_local || !settings.openclaw_prefer_gateway {
        args.push("--local".to_string());
    }

    let output = security::run_subprocess(&SubprocessRequest {
        binary: binary.to_string(),
        args,
        cwd: workspace_root.map(|p| p.to_path_buf()),
        stdin: None,
        timeout: Duration::from_secs(timeout_secs as u64),
        env_keys: vec![],
    })?;

    let _ = fs::remove_dir_all(&temp_dir);

    if output.exit_code.unwrap_or(1) != 0 {
        return Err(format!(
            "{} agent exited with {:?}: {}{}",
            entry.label,
            output.exit_code,
            output.stderr,
            if output.stdout.trim().is_empty() {
                String::new()
            } else {
                format!("\nstdout: {}", output.stdout)
            }
        ));
    }

    parse_json_response(&output.stdout, started.elapsed())
}

fn run_legacy_stdin(
    entry: &RuntimeCatalogEntry,
    binary: &str,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
) -> Result<RuntimeResult, String> {
    let started = Instant::now();
    let workspace_addon = crate::scrum::agent_tools::workspace_prompt_addon(
        workspace_root,
        agent,
        project_title,
        task,
        true,
    );
    let prompt = crate::agent_runtime::task_prompt::build_compact_prompt(
        task,
        agent,
        project_title,
        workspace_addon.as_deref(),
    );

    let output = security::run_subprocess(&SubprocessRequest {
        binary: binary.to_string(),
        args: vec!["--stdin-task".to_string()],
        cwd: workspace_root.map(|p| p.to_path_buf()),
        stdin: Some(prompt),
        timeout: Duration::from_secs(600),
        env_keys: vec![],
    })?;

    if output.exit_code.unwrap_or(1) != 0 {
        return Err(format!(
            "{} legacy mode exited with {:?}: {}",
            entry.label, output.exit_code, output.stderr
        ));
    }

    let content = output.stdout.trim().to_string();
    if content.is_empty() {
        return Err(format!("{} returned empty output.", entry.label));
    }

    Ok(RuntimeResult {
        content,
        transport: "legacy-stdin".to_string(),
        session_id: None,
        duration_ms: started.elapsed().as_millis() as u64,
    })
}

fn parse_json_response(stdout: &str, elapsed: Duration) -> Result<RuntimeResult, String> {
    let trimmed = stdout.trim();
    if let Ok(parsed) = serde_json::from_str::<ClawJsonResponse>(trimmed) {
        if let Some(error) = parsed.error.filter(|value| !value.trim().is_empty()) {
            return Err(format!("Claw agent error: {error}"));
        }

        let mut chunks: Vec<String> = parsed
            .payloads
            .into_iter()
            .filter_map(|payload| payload.text)
            .map(|text| text.trim().to_string())
            .filter(|text| !text.is_empty())
            .collect();

        if chunks.is_empty() {
            if let Some(text) = parsed.text.or(parsed.response) {
                chunks.push(text);
            }
        }

        let content = chunks.join("\n\n").trim().to_string();
        if content.is_empty() {
            return Err("Claw JSON response contained no deliverable text.".to_string());
        }

        let meta = parsed.meta;
        return Ok(RuntimeResult {
            content,
            transport: meta
                .as_ref()
                .and_then(|value| value.transport.clone())
                .unwrap_or_else(|| "claw-agent".to_string()),
            session_id: meta.as_ref().and_then(|value| value.session_id.clone()),
            duration_ms: meta
                .and_then(|value| value.duration_ms)
                .unwrap_or(elapsed.as_millis() as u64),
        });
    }

    if trimmed.is_empty() {
        return Err("Claw agent returned empty output.".to_string());
    }

    Ok(RuntimeResult {
        content: trimmed.to_string(),
        transport: "claw-text".to_string(),
        session_id: None,
        duration_ms: elapsed.as_millis() as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_json_payload_text() {
        let json = r#"{"payloads":[{"text":"Deliverable ready"}],"meta":{"transport":"embedded"}}"#;
        let parsed = parse_json_response(json, Duration::from_millis(10)).unwrap();
        assert_eq!(parsed.content, "Deliverable ready");
        assert_eq!(parsed.transport, "embedded");
    }
}