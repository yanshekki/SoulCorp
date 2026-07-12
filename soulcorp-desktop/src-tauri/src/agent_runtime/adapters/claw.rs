use super::run_subprocess_for_agent;
use crate::agent_activity::ActivityRunContext;
use crate::agent_runtime::prompt_file::{PromptDelivery, PromptFile};
use crate::agent_runtime::registry::prompt_delivery_for_adapter;
use crate::agent_runtime::security::{self, SubprocessRequest};
use crate::agent_runtime::task_prompt::{materialize_soul_file, resolve_agent_id};
use crate::agent_runtime::types::RuntimeCatalogEntry;
use crate::agent_runtime::types::{RuntimeProbe, RuntimeResult};
use crate::scrum::types::WorkNode;
use crate::state::{AgentRecord, AppState, GameSettings};
use serde::Deserialize;
use std::path::Path;
use std::time::{Duration, Instant};

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
    state: Option<&mut AppState>,
    entry: &RuntimeCatalogEntry,
    settings: &GameSettings,
    company_id: &str,
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
    let probe = probe(entry, settings);
    if probe.agent_command_available {
        run_agent_cli(
            state,
            entry,
            settings,
            &binary,
            company_id,
            task,
            agent,
            project_title,
            workspace_root,
            activity,
        )
    } else {
        run_legacy_stdin(
            state,
            entry,
            settings,
            &binary,
            task,
            agent,
            project_title,
            workspace_root,
            activity,
        )
    }
}

fn run_agent_cli(
    state: Option<&mut AppState>,
    entry: &RuntimeCatalogEntry,
    settings: &GameSettings,
    binary: &str,
    company_id: &str,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
    activity: Option<ActivityRunContext>,
) -> Result<RuntimeResult, String> {
    let started = Instant::now();
    let temp_dir = PromptFile::alloc_dir(&entry.id)?;
    let soul_path = materialize_soul_file(&temp_dir, agent, workspace_root)?;
    let workspace_addon = crate::scrum::agent_tools::workspace_prompt_addon(
        workspace_root,
        agent,
        project_title,
        task,
        true,
    );
    let lang_block = crate::i18n::language_instruction(crate::i18n::language_from_settings(settings));
    let message = crate::agent_runtime::task_prompt::build_task_message_lang(
        task,
        agent,
        project_title,
        soul_path.as_deref(),
        workspace_addon.as_deref(),
        Some(&lang_block),
    );
    let delivery = prompt_delivery_for_adapter(&entry.adapter);
    let prompt_file = PromptFile::write_into(temp_dir, "prompt.md", &message)?;

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
    ];
    args.extend(prompt_file.delivery_args(&delivery));
    args.extend([
        "--json".to_string(),
        "--timeout".to_string(),
        timeout_secs.to_string(),
        "--no-color".to_string(),
    ]);

    if let Some(session_key) = session_key {
        args.push("--session-key".to_string());
        args.push(session_key);
    }

    if settings.openclaw_use_local || !settings.openclaw_prefer_gateway {
        args.push("--local".to_string());
    }

    let request = SubprocessRequest {
        binary: binary.to_string(),
        args,
        cwd: workspace_root.map(|p| p.to_path_buf()),
        stdin: prompt_file.stdin_for(&delivery),
        timeout: Duration::from_secs(timeout_secs as u64),
        env_keys: vec![],
    };
    let output = run_subprocess_for_agent(state, &request, activity, &agent.id)?;
    drop(prompt_file);

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
    state: Option<&mut AppState>,
    entry: &RuntimeCatalogEntry,
    settings: &GameSettings,
    binary: &str,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
    activity: Option<ActivityRunContext>,
) -> Result<RuntimeResult, String> {
    let started = Instant::now();
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
    // Always materialize to disk first; deliver via stdin (never full body in argv).
    let prompt_file = PromptFile::write(&entry.id, &prompt)?;
    let delivery = PromptDelivery::Stdin;

    let request = SubprocessRequest {
        binary: binary.to_string(),
        args: vec!["--stdin-task".to_string()],
        cwd: workspace_root.map(|p| p.to_path_buf()),
        stdin: prompt_file.stdin_for(&delivery),
        timeout: Duration::from_secs(600),
        env_keys: vec![],
    };
    let output = run_subprocess_for_agent(state, &request, activity, &agent.id)?;
    drop(prompt_file);

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