use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub const MAX_CAPTURE_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct SubprocessRequest {
    pub binary: String,
    pub args: Vec<String>,
    pub cwd: Option<PathBuf>,
    pub stdin: Option<String>,
    pub timeout: Duration,
    pub env_keys: Vec<(String, String)>,
}

#[derive(Debug, Clone)]
pub struct SubprocessOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
}

pub fn validate_binary_path(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Binary path is empty.".to_string());
    }
    if trimmed.contains('\0') || trimmed.chars().any(|ch| ch.is_control()) {
        return Err("Binary path contains invalid characters.".to_string());
    }
    if trimmed.contains("..") {
        return Err("Binary path must not contain '..'.".to_string());
    }
    Ok(trimmed.to_string())
}

pub fn resolve_binary(
    configured_path: &str,
    default_binary: &str,
    label: &str,
) -> Result<String, String> {
    let configured = configured_path.trim();
    if !configured.is_empty() {
        let validated = validate_binary_path(configured)?;
        if Path::new(&validated).exists() || command_succeeds(&validated, &["--version"]) {
            return Ok(validated);
        }
        return Err(format!(
            "Configured {label} binary not found or not executable: {validated}"
        ));
    }

    if default_binary.is_empty() {
        return Err(format!("{label} binary not configured."));
    }

    if command_succeeds(default_binary, &["--version"]) {
        return Ok(default_binary.to_string());
    }

    Err(format!(
        "{label} binary not configured. Set the path in Command Center → Policies, or install `{default_binary}` on PATH."
    ))
}

pub fn run_subprocess_observed(
    request: &SubprocessRequest,
    on_line: &mut dyn FnMut(&str, &str),
) -> Result<SubprocessOutput, String> {
    run_subprocess_inner(request, Some(on_line))
}

pub fn run_subprocess(request: &SubprocessRequest) -> Result<SubprocessOutput, String> {
    run_subprocess_inner(request, None)
}

fn run_subprocess_inner(
    request: &SubprocessRequest,
    mut on_line: Option<&mut dyn FnMut(&str, &str)>,
) -> Result<SubprocessOutput, String> {
    let binary = validate_binary_path(&request.binary)?;
    let started = Instant::now();

    let mut command = Command::new(&binary);
    command
        .args(&request.args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(cwd) = &request.cwd {
        if cwd.exists() {
            command.current_dir(cwd);
        }
    }

    for (key, value) in &request.env_keys {
        command.env(key, value);
    }

    let output = if let Some(callback) = on_line.as_mut() {
        let mut child = command
            .stdin(if request.stdin.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .spawn()
            .map_err(|e| format!("Failed to spawn {binary}: {e}"))?;

        if let Some(stdin_body) = &request.stdin {
            if let Some(mut stdin) = child.stdin.take() {
                stdin
                    .write_all(stdin_body.as_bytes())
                    .map_err(|e| format!("Stdin write failed for {binary}: {e}"))?;
            }
        }

        let mut stdout_text = String::new();
        let mut stderr_text = String::new();

        if let Some(stdout_pipe) = child.stdout.take() {
            let mut reader = BufReader::new(stdout_pipe);
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) => break,
                    Ok(_) => {
                        callback("stdout", line.trim_end());
                        stdout_text.push_str(&line);
                    }
                    Err(error) => {
                        return Err(format!("Failed reading {binary} stdout: {error}"));
                    }
                }
            }
        }

        if let Some(stderr_pipe) = child.stderr.take() {
            let mut reader = BufReader::new(stderr_pipe);
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) => break,
                    Ok(_) => {
                        callback("stderr", line.trim_end());
                        stderr_text.push_str(&line);
                    }
                    Err(error) => {
                        return Err(format!("Failed reading {binary} stderr: {error}"));
                    }
                }
            }
        }

        let status = child
            .wait()
            .map_err(|e| format!("Failed waiting for {binary}: {e}"))?;

        std::process::Output {
            status,
            stdout: stdout_text.into_bytes(),
            stderr: stderr_text.into_bytes(),
        }
    } else if let Some(stdin_body) = &request.stdin {
        let mut child = command
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn {binary}: {e}"))?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(stdin_body.as_bytes())
                .map_err(|e| format!("Stdin write failed for {binary}: {e}"))?;
        }
        child
            .wait_with_output()
            .map_err(|e| format!("Failed waiting for {binary}: {e}"))?
    } else {
        command
            .output()
            .map_err(|e| format!("Failed to spawn {binary}: {e}"))?
    };

    let duration_ms = started.elapsed().as_millis() as u64;
    if duration_ms > request.timeout.as_millis() as u64 {
        return Err(format!(
            "{binary} exceeded timeout of {}s.",
            request.timeout.as_secs()
        ));
    }

    Ok(SubprocessOutput {
        stdout: truncate_capture(&String::from_utf8_lossy(&output.stdout)),
        stderr: truncate_capture(&String::from_utf8_lossy(&output.stderr)),
        exit_code: output.status.code(),
        duration_ms,
    })
}

pub fn truncate_capture(text: &str) -> String {
    let stripped = strip_ansi(text);
    if stripped.len() <= MAX_CAPTURE_BYTES {
        return stripped;
    }
    format!(
        "{}… [truncated]",
        &stripped[..MAX_CAPTURE_BYTES.saturating_sub(16)]
    )
}

pub fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            if chars.next_if_eq(&'[').is_some() {
                for next in chars.by_ref() {
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
            continue;
        }
        out.push(ch);
    }
    out
}

pub fn command_succeeds(cmd: &str, args: &[&str]) -> bool {
    Command::new(cmd)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

pub fn command_stdout(cmd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run {cmd}: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(stderr.trim().to_string());
    }
    Ok(truncate_capture(&String::from_utf8_lossy(&output.stdout)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_parent_traversal() {
        assert!(validate_binary_path("../bin/openclaw").is_err());
    }

    #[test]
    fn strips_ansi_codes() {
        let cleaned = strip_ansi("\u{1b}[31mhello\u{1b}[0m");
        assert_eq!(cleaned, "hello");
    }
}