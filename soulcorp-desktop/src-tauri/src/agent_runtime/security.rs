use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::thread;
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
            return Ok(prefer_absolute_path(&validated));
        }
        return Err(format!(
            "Configured {label} binary not found or not executable: {validated}"
        ));
    }

    if default_binary.is_empty() {
        return Err(format!("{label} binary not configured."));
    }

    // 1) PATH lookup (may miss ~/.local/bin when the desktop is launched without a login shell)
    if let Some(from_path) = find_on_path(default_binary) {
        if command_succeeds(&from_path, &["--version"]) {
            return Ok(from_path);
        }
    }
    if command_succeeds(default_binary, &["--version"]) {
        return Ok(prefer_absolute_path(default_binary));
    }

    // 2) Common install locations for CLI tools installed outside GUI PATH
    for candidate in common_binary_candidates(default_binary) {
        if Path::new(&candidate).is_file() && command_succeeds(&candidate, &["--version"]) {
            return Ok(candidate);
        }
    }

    Err(format!(
        "{label} binary not configured. Set the path in Command Center → Policies, or install `{default_binary}` on PATH."
    ))
}

fn prefer_absolute_path(binary: &str) -> String {
    let path = Path::new(binary);
    if path.is_absolute() {
        return binary.to_string();
    }
    find_on_path(binary).unwrap_or_else(|| binary.to_string())
}

fn find_on_path(binary: &str) -> Option<String> {
    if binary.contains('/') {
        return Path::new(binary)
            .is_file()
            .then(|| binary.to_string());
    }
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(binary);
        if candidate.is_file() {
            return Some(candidate.display().to_string());
        }
    }
    None
}

fn common_binary_candidates(binary: &str) -> Vec<String> {
    let name = Path::new(binary)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(binary);
    let mut out = Vec::new();
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        out.push(home.join(".local/bin").join(name).display().to_string());
        out.push(home.join("bin").join(name).display().to_string());
        out.push(
            home.join(".cargo/bin")
                .join(name)
                .display()
                .to_string(),
        );
    }
    out.push(format!("/usr/local/bin/{name}"));
    out.push(format!("/usr/bin/{name}"));
    out
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
    let timeout = request.timeout.max(Duration::from_secs(15));

    let mut command = Command::new(&binary);
    command
        .args(&request.args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(if request.stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        });

    if let Some(cwd) = &request.cwd {
        if cwd.exists() {
            command.current_dir(cwd);
        }
    }

    for (key, value) in &request.env_keys {
        command.env(key, value);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn {binary}: {e}"))?;

    if let Some(stdin_body) = &request.stdin {
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(stdin_body.as_bytes());
        }
    }

    if let Some(cb) = on_line.as_mut() {
        cb(
            "stdout",
            &format!(
                "▶ Started `{binary}` (timeout {}s). Waiting for process output…",
                timeout.as_secs()
            ),
        );
    }

    let (stdout_text, stderr_text, exit_code) =
        wait_child_with_timeout(&mut child, timeout, started, &mut on_line, &binary)?;

    let duration_ms = started.elapsed().as_millis() as u64;
    Ok(SubprocessOutput {
        stdout: truncate_capture(&stdout_text),
        stderr: truncate_capture(&stderr_text),
        exit_code,
        duration_ms,
    })
}

enum IoEvent {
    Stdout(String),
    Stderr(String),
    StdoutDone,
    StderrDone,
}

/// Concurrent stdout/stderr + hard kill on timeout + heartbeat while silent.
fn wait_child_with_timeout(
    child: &mut Child,
    timeout: Duration,
    started: Instant,
    on_line: &mut Option<&mut dyn FnMut(&str, &str)>,
    binary: &str,
) -> Result<(String, String, Option<i32>), String> {
    let stdout_pipe = child.stdout.take();
    let stderr_pipe = child.stderr.take();
    let (tx, rx) = mpsc::channel::<IoEvent>();

    if let Some(stdout_pipe) = stdout_pipe {
        let tx = tx.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stdout_pipe);
            for line in reader.lines() {
                match line {
                    Ok(l) => {
                        if tx.send(IoEvent::Stdout(l)).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            let _ = tx.send(IoEvent::StdoutDone);
        });
    } else {
        let _ = tx.send(IoEvent::StdoutDone);
    }

    if let Some(stderr_pipe) = stderr_pipe {
        let tx = tx.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stderr_pipe);
            for line in reader.lines() {
                match line {
                    Ok(l) => {
                        if tx.send(IoEvent::Stderr(l)).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            let _ = tx.send(IoEvent::StderrDone);
        });
    } else {
        let _ = tx.send(IoEvent::StderrDone);
    }
    drop(tx);

    let mut stdout_text = String::new();
    let mut stderr_text = String::new();
    let mut stdout_done = false;
    let mut stderr_done = false;
    let mut last_heartbeat = Instant::now();
    let mut saw_output = false;

    loop {
        if started.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            if let Some(cb) = on_line.as_mut() {
                cb(
                    "stderr",
                    &format!("✖ `{binary}` killed after {}s timeout.", timeout.as_secs()),
                );
            }
            return Err(format!(
                "{binary} exceeded timeout of {}s (process killed).",
                timeout.as_secs()
            ));
        }

        match rx.recv_timeout(Duration::from_millis(400)) {
            Ok(IoEvent::Stdout(line)) => {
                saw_output = true;
                if let Some(cb) = on_line.as_mut() {
                    cb("stdout", line.trim_end());
                }
                stdout_text.push_str(&line);
                if !stdout_text.ends_with('\n') {
                    stdout_text.push('\n');
                }
            }
            Ok(IoEvent::Stderr(line)) => {
                saw_output = true;
                if let Some(cb) = on_line.as_mut() {
                    cb("stderr", line.trim_end());
                }
                stderr_text.push_str(&line);
                if !stderr_text.ends_with('\n') {
                    stderr_text.push('\n');
                }
            }
            Ok(IoEvent::StdoutDone) => stdout_done = true,
            Ok(IoEvent::StderrDone) => stderr_done = true,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if !saw_output && last_heartbeat.elapsed() >= Duration::from_secs(5) {
                    last_heartbeat = Instant::now();
                    if let Some(cb) = on_line.as_mut() {
                        cb(
                            "stdout",
                            &format!(
                                "… still running ({}s) — headless CLI often buffers until finished",
                                started.elapsed().as_secs()
                            ),
                        );
                    }
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                stdout_done = true;
                stderr_done = true;
            }
        }

        if stdout_done && stderr_done {
            break;
        }
    }

    let status = child
        .wait()
        .map_err(|e| format!("Failed waiting for {binary}: {e}"))?;

    Ok((stdout_text, stderr_text, status.code()))
}

fn truncate_capture(text: &str) -> String {
    if text.len() <= MAX_CAPTURE_BYTES {
        return text.to_string();
    }
    let mut end = MAX_CAPTURE_BYTES;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…[truncated]", &text[..end])
}

pub fn command_succeeds(binary: &str, args: &[&str]) -> bool {
    Command::new(binary)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn command_stdout(binary: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(binary)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .map_err(|e| format!("Failed to run {binary}: {e}"))?;
    if !output.status.success() {
        return Err(format!("{binary} exited with {:?}", output.status.code()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
