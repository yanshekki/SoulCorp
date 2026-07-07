use crate::agent_runtime::detached::DetachedRuntimeContext;
use crate::scrum::types::WorkNode;
use crate::state::{AgentRecord, AppState, GameSettings};
use serde::Deserialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use uuid::Uuid;

#[derive(Debug, Clone, serde::Serialize)]
pub struct OpenClawProbe {
    pub binary_path: String,
    pub binary_available: bool,
    pub version: Option<String>,
    pub agent_command_available: bool,
    pub gateway_healthy: bool,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct OpenClawRunResult {
    pub content: String,
    pub transport: String,
    #[allow(dead_code)]
    pub session_id: Option<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Deserialize)]
struct OpenClawJsonResponse {
    #[serde(default)]
    payloads: Vec<OpenClawJsonPayload>,
    meta: Option<OpenClawJsonMeta>,
    #[serde(default)]
    error: Option<String>,
    text: Option<String>,
    response: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenClawJsonPayload {
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenClawJsonMeta {
    transport: Option<String>,
    session_id: Option<String>,
    duration_ms: Option<u64>,
}

pub fn probe_openclaw(settings: &GameSettings) -> OpenClawProbe {
    let binary_path = match resolve_openclaw_binary(settings) {
        Ok(path) => path,
        Err(message) => {
            return OpenClawProbe {
                binary_path: settings.openclaw_binary_path.clone(),
                binary_available: false,
                version: None,
                agent_command_available: false,
                gateway_healthy: false,
                message,
            };
        }
    };

    let version = command_stdout(&binary_path, &["--version"]).ok();
    let agent_command_available = command_succeeds(&binary_path, &["agent", "--help"]);
    let gateway_healthy = if settings.openclaw_prefer_gateway && agent_command_available {
        command_succeeds(&binary_path, &["gateway", "health"])
    } else {
        false
    };

    let message = if !agent_command_available {
        "OpenClaw binary found, but `openclaw agent` is unavailable. Legacy stdin mode may still work.".into()
    } else if settings.openclaw_prefer_gateway && gateway_healthy {
        "OpenClaw ready — gateway healthy.".into()
    } else if settings.openclaw_use_local {
        "OpenClaw ready — local embedded agent mode.".into()
    } else {
        "OpenClaw ready.".into()
    };

    OpenClawProbe {
        binary_path,
        binary_available: true,
        version,
        agent_command_available,
        gateway_healthy,
        message,
    }
}

pub fn execute_openclaw(
    state: &AppState,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
) -> Result<String, String> {
    let result = run_openclaw_for_task(
        &state.settings,
        &state.company_id,
        task,
        agent,
        project_title,
        None,
    )?;
    Ok(result.content)
}

pub fn execute_openclaw_detached(
    ctx: &DetachedRuntimeContext,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
) -> Result<String, String> {
    let result = run_openclaw_for_task(
        &ctx.settings,
        &ctx.company_id,
        task,
        agent,
        project_title,
        ctx.workspace_root.as_deref(),
    )?;
    Ok(result.content)
}

pub fn run_openclaw_for_task(
    settings: &GameSettings,
    company_id: &str,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
) -> Result<OpenClawRunResult, String> {
    let binary = resolve_openclaw_binary(settings)?;
    let probe = probe_openclaw(settings);

    if probe.agent_command_available {
        run_openclaw_agent_cli(
            settings,
            &binary,
            company_id,
            task,
            agent,
            project_title,
            workspace_root,
        )
    } else {
        run_openclaw_legacy_stdin(&binary, task, agent, project_title)
    }
}

fn run_openclaw_agent_cli(
    settings: &GameSettings,
    binary: &str,
    company_id: &str,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_root: Option<&Path>,
) -> Result<OpenClawRunResult, String> {
    let started = Instant::now();
    let temp_dir = std::env::temp_dir().join(format!("soulcorp-openclaw-{}", Uuid::new_v4()));
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let message_path = temp_dir.join("task.md");
    let soul_path = materialize_soul_file(&temp_dir, agent, workspace_root)?;
    let message = build_task_message(task, agent, project_title, soul_path.as_deref());
    fs::write(&message_path, message).map_err(|e| e.to_string())?;

    let openclaw_agent_id = resolve_openclaw_agent_id(settings, agent);
    let session_key = if company_id.is_empty() {
        None
    } else {
        Some(format!(
            "agent:{openclaw_agent_id}:soulcorp-{company_id}-{}",
            task.id
        ))
    };

    let timeout_secs = settings.openclaw_timeout_secs.max(30);
    let mut args = vec![
        "agent".to_string(),
        "--agent".to_string(),
        openclaw_agent_id,
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

    let output = Command::new(binary)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to spawn OpenClaw ({binary}): {e}"))?;

    let _ = fs::remove_dir_all(&temp_dir);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "OpenClaw agent exited with {}: {stderr}{}",
            output.status,
            if stdout.trim().is_empty() {
                String::new()
            } else {
                format!("\nstdout: {stdout}")
            }
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_openclaw_response(&stdout, started.elapsed())
}

fn run_openclaw_legacy_stdin(
    binary: &str,
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
) -> Result<OpenClawRunResult, String> {
    let started = Instant::now();
    let prompt = format!(
        "Project: {project_title}\nAgent: {} ({})\nDepartment: {}\nTask: {}\nDetails: {}\nAcceptance:\n- {}\n\nReturn the final deliverable as plain text/markdown.",
        agent.name,
        agent.role,
        agent.department,
        task.title,
        task.description,
        task.acceptance_criteria.join("\n- ")
    );

    let mut child = Command::new(binary)
        .arg("--stdin-task")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn OpenClaw legacy mode ({binary}): {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(prompt.as_bytes())
            .map_err(|e| format!("OpenClaw stdin write failed: {e}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("OpenClaw wait failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "OpenClaw legacy mode exited with {}: {stderr}",
            output.status
        ));
    }

    let content = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if content.is_empty() {
        return Err("OpenClaw returned empty output.".to_string());
    }

    Ok(OpenClawRunResult {
        content,
        transport: "legacy-stdin".to_string(),
        session_id: None,
        duration_ms: started.elapsed().as_millis() as u64,
    })
}

fn parse_openclaw_response(stdout: &str, elapsed: Duration) -> Result<OpenClawRunResult, String> {
    let trimmed = stdout.trim();
    if let Ok(parsed) = serde_json::from_str::<OpenClawJsonResponse>(trimmed) {
        if let Some(error) = parsed.error.filter(|value| !value.trim().is_empty()) {
            return Err(format!("OpenClaw agent error: {error}"));
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
            return Err("OpenClaw JSON response contained no deliverable text.".to_string());
        }

        let meta = parsed.meta;
        let transport = meta
            .as_ref()
            .and_then(|value| value.transport.clone())
            .unwrap_or_else(|| "openclaw-agent".to_string());
        let session_id = meta
            .as_ref()
            .and_then(|value| value.session_id.clone());
        let duration_ms = meta
            .and_then(|value| value.duration_ms)
            .unwrap_or(elapsed.as_millis() as u64);
        return Ok(OpenClawRunResult {
            content,
            transport,
            session_id,
            duration_ms,
        });
    }

    if trimmed.is_empty() {
        return Err("OpenClaw returned empty output.".to_string());
    }

    Ok(OpenClawRunResult {
        content: trimmed.to_string(),
        transport: "openclaw-text".to_string(),
        session_id: None,
        duration_ms: elapsed.as_millis() as u64,
    })
}

fn build_task_message(
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    soul_path: Option<&Path>,
) -> String {
    let acceptance = if task.acceptance_criteria.is_empty() {
        "- Meet the task objective with clear, actionable output.".to_string()
    } else {
        task.acceptance_criteria
            .iter()
            .map(|item| format!("- {item}"))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let soul_section = match agent.soul.as_ref() {
        Some(soul) if !soul.raw_content.trim().is_empty() => soul.raw_content.trim().to_string(),
        _ => "No soul profile defined.".to_string(),
    };

    let soul_file_note = soul_path
        .map(|path| format!("\nSoul file path: {}\n", path.display()))
        .unwrap_or_default();

    format!(
        "# SoulCorp task execution\n\n## Agent\n- Name: {name}\n- Role: {role}\n- Department: {department}\n\n## Project\n{project_title}\n\n## Task\n**{title}**\n\n{description}\n\n## Acceptance criteria\n{acceptance}\n\n## Agent soul\n{soul_section}{soul_file_note}\n## Instructions\nComplete this task using your available tools. Return the final deliverable as markdown plain text in your reply. Summarize files created and key decisions.",
        name = agent.name,
        role = agent.role,
        department = agent.department,
        title = task.title,
        description = if task.description.trim().is_empty() {
            "No additional details.".to_string()
        } else {
            task.description.clone()
        },
    )
}

fn materialize_soul_file(
    temp_dir: &Path,
    agent: &AgentRecord,
    workspace_root: Option<&Path>,
) -> Result<Option<PathBuf>, String> {
    let Some(soul) = agent.soul.as_ref() else {
        return Ok(None);
    };
    if soul.raw_content.trim().is_empty() {
        return Ok(None);
    }

    if let Some(root) = workspace_root {
        let company_soul = root
            .join("agent-souls")
            .join(format!("{}.md", agent.id));
        if company_soul.exists() {
            return Ok(Some(company_soul));
        }
    }

    let path = temp_dir.join(format!("{}.soul.md", agent.id));
    fs::write(&path, &soul.raw_content).map_err(|e| e.to_string())?;
    Ok(Some(path))
}

fn resolve_openclaw_agent_id(settings: &GameSettings, agent: &AgentRecord) -> String {
    if !settings.openclaw_default_agent_id.trim().is_empty() {
        return settings.openclaw_default_agent_id.trim().to_string();
    }

    let slug = agent
        .id
        .trim_start_matches("agent-")
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>();

    if slug.is_empty() {
        "main".to_string()
    } else {
        slug
    }
}

pub fn resolve_openclaw_binary(settings: &GameSettings) -> Result<String, String> {
    let configured = settings.openclaw_binary_path.trim();
    if !configured.is_empty() {
        if Path::new(configured).exists() || command_succeeds(configured, &["--version"]) {
            return Ok(configured.to_string());
        }
        return Err(format!(
            "Configured OpenClaw binary not found or not executable: {configured}"
        ));
    }

    if command_succeeds("openclaw", &["--version"]) {
        return Ok("openclaw".to_string());
    }

    Err("OpenClaw binary not configured. Set the path in Command Center → Policies, or install `openclaw` on PATH.".to_string())
}

fn command_succeeds(cmd: &str, args: &[&str]) -> bool {
    Command::new(cmd)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn command_stdout(cmd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run {cmd}: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(stderr.trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_json_payload_text() {
        let json = r#"{"payloads":[{"text":"Deliverable ready"}],"meta":{"transport":"embedded"}}"#;
        let parsed = parse_openclaw_response(json, Duration::from_millis(10)).unwrap();
        assert_eq!(parsed.content, "Deliverable ready");
        assert_eq!(parsed.transport, "embedded");
    }
}