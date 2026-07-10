//! Multi-language script runner: .sh .php .js .py .rs → JSON result.

use super::SkillExecContext;
use super::super::runtimes::{self, RuntimeId};
use super::super::types::SkillDispatchResult;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;

const MAX_OUTPUT: usize = 256 * 1024;
const DEFAULT_TIMEOUT_SECS: u64 = 15;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptRunResult {
    pub ok: bool,
    pub runtime: String,
    pub runtime_path: Option<String>,
    pub entry: String,
    pub argv: Vec<String>,
    pub cwd: String,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
    pub parsed_json: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// Parse Lab line: `test.php a b c` → (entry, argv)
pub fn parse_command_line(line: &str) -> Result<(String, Vec<String>), String> {
    let line = line.trim();
    if line.is_empty() {
        return Err("Empty command. Example: test.php a b c".into());
    }
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut in_quotes: Option<char> = None;
    for ch in line.chars() {
        match (ch, in_quotes) {
            ('"' | '\'', None) => in_quotes = Some(ch),
            (q, Some(oq)) if q == oq => in_quotes = None,
            (c, Some(_)) => current.push(c),
            (c, None) if c.is_whitespace() => {
                if !current.is_empty() {
                    parts.push(std::mem::take(&mut current));
                }
            }
            (c, None) => current.push(c),
        }
    }
    if in_quotes.is_some() {
        return Err("Unclosed quote in command line.".into());
    }
    if !current.is_empty() {
        parts.push(current);
    }
    if parts.is_empty() {
        return Err("Empty command.".into());
    }
    let entry = parts.remove(0);
    Ok((entry, parts))
}

fn jail_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = rel.trim().trim_start_matches("./");
    if rel.is_empty() {
        return Err("Empty entry path.".into());
    }
    if rel.contains('\0') {
        return Err("Invalid path.".into());
    }
    let candidate = root.join(rel);
    let root_canon = root
        .canonicalize()
        .unwrap_or_else(|_| root.to_path_buf());
    // Create parent path may not exist for new files; canonicalize file if exists
    let final_path = if candidate.exists() {
        candidate
            .canonicalize()
            .map_err(|e| format!("Invalid path: {e}"))?
    } else {
        // Ensure no .. escape by normalizing components
        let mut clean = PathBuf::new();
        for c in Path::new(rel).components() {
            match c {
                std::path::Component::ParentDir => {
                    if !clean.pop() {
                        return Err("Path escapes skill root.".into());
                    }
                }
                std::path::Component::CurDir => {}
                std::path::Component::Normal(s) => clean.push(s),
                _ => return Err("Absolute paths not allowed.".into()),
            }
        }
        root.join(clean)
    };
    if !final_path.starts_with(&root_canon) && !final_path.starts_with(root) {
        return Err("Path escapes skill root.".into());
    }
    Ok(final_path)
}

pub fn run_script_file(
    app_data: &Path,
    skill_root: &Path,
    entry_rel: &str,
    argv: &[String],
    timeout_secs: u64,
) -> ScriptRunResult {
    let started = Instant::now();
    let entry_path = match jail_join(skill_root, entry_rel) {
        Ok(p) => p,
        Err(e) => {
            return err_result(entry_rel, argv, skill_root, e, started);
        }
    };
    if !entry_path.is_file() {
        return err_result(
            entry_rel,
            argv,
            skill_root,
            format!("Entry file not found: {}", entry_path.display()),
            started,
        );
    }

    let ext = entry_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let Some(runtime) = RuntimeId::from_extension(ext) else {
        return err_result(
            entry_rel,
            argv,
            skill_root,
            format!("Unsupported extension '.{ext}'. Use .sh .php .js .py .rs"),
            started,
        );
    };

    let bin = match runtimes::resolve_runtime_bin(app_data, runtime) {
        Ok(p) => p,
        Err(e) => return err_result(entry_rel, argv, skill_root, e, started),
    };

    let path_env = runtimes::toolchain_path_prefix(app_data);
    let timeout = timeout_secs.clamp(1, 60);

    let result = match runtime {
        RuntimeId::Rust => run_rust(app_data, &bin, &entry_path, argv, skill_root, &path_env, timeout),
        RuntimeId::Sh => spawn_with_timeout(
            &bin,
            &[entry_path.to_string_lossy().as_ref()]
                .into_iter()
                .chain(argv.iter().map(String::as_str))
                .collect::<Vec<_>>(),
            skill_root,
            &path_env,
            timeout,
        ),
        RuntimeId::Php | RuntimeId::Node | RuntimeId::Python => {
            let mut args = vec![entry_path.to_string_lossy().to_string()];
            args.extend(argv.iter().cloned());
            spawn_with_timeout(
                &bin,
                &args.iter().map(String::as_str).collect::<Vec<_>>(),
                skill_root,
                &path_env,
                timeout,
            )
        }
    };

    match result {
        Ok((code, stdout, stderr)) => {
            let stdout = truncate(&stdout, MAX_OUTPUT);
            let stderr = truncate(&stderr, MAX_OUTPUT);
            let parsed = try_parse_json(&stdout);
            let ok = code.unwrap_or(1) == 0;
            ScriptRunResult {
                ok,
                runtime: runtime.as_str().to_string(),
                runtime_path: Some(bin.display().to_string()),
                entry: entry_rel.to_string(),
                argv: argv.to_vec(),
                cwd: skill_root.display().to_string(),
                exit_code: code,
                stdout,
                stderr,
                duration_ms: started.elapsed().as_millis() as u64,
                parsed_json: parsed,
                error: if ok {
                    None
                } else {
                    Some(format!("Process exited with code {code:?}"))
                },
            }
        }
        Err(e) => err_result(entry_rel, argv, skill_root, e, started),
    }
}

fn run_rust(
    app_data: &Path,
    rustc: &Path,
    entry: &Path,
    argv: &[String],
    cwd: &Path,
    path_env: &str,
    timeout: u64,
) -> Result<(Option<i32>, String, String), String> {
    let source = fs::read_to_string(entry).map_err(|e| e.to_string())?;
    let hash = simple_hash(&source);
    let cache = runtimes::toolchains_root(app_data)
        .join("rust")
        .join("skill-cache")
        .join(&hash);
    fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    let bin_path = cache.join("skill_bin");
    let src_copy = cache.join("main.rs");
    let need_build = !bin_path.exists()
        || fs::read_to_string(&src_copy).ok().as_deref() != Some(source.as_str());
    if need_build {
        fs::write(&src_copy, &source).map_err(|e| e.to_string())?;
        let out = Command::new(rustc)
            .args([
                "-O",
                src_copy.to_str().unwrap_or("main.rs"),
                "-o",
                bin_path.to_str().unwrap_or("skill_bin"),
            ])
            .current_dir(&cache)
            .env("PATH", path_env)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| format!("rustc spawn failed: {e}"))?;
        if !out.status.success() {
            return Ok((
                out.status.code(),
                String::from_utf8_lossy(&out.stdout).to_string(),
                format!(
                    "rustc failed:\n{}",
                    String::from_utf8_lossy(&out.stderr)
                ),
            ));
        }
    }
    spawn_with_timeout(
        &bin_path,
        &argv.iter().map(String::as_str).collect::<Vec<_>>(),
        cwd,
        path_env,
        timeout,
    )
}

fn spawn_with_timeout(
    bin: &Path,
    args: &[&str],
    cwd: &Path,
    path_env: &str,
    timeout_secs: u64,
) -> Result<(Option<i32>, String, String), String> {
    let use_timeout = Command::new("timeout")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    let mut cmd = if use_timeout {
        let mut c = Command::new("timeout");
        c.arg(format!("{timeout_secs}s")).arg(bin);
        for a in args {
            c.arg(a);
        }
        c
    } else {
        let mut c = Command::new(bin);
        for a in args {
            c.arg(a);
        }
        c
    };

    cmd.current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env_clear()
        .env("PATH", path_env)
        .env("HOME", cwd)
        .env("TMPDIR", "/tmp")
        .env("LANG", "C.UTF-8");

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to spawn {}: {e}", bin.display()))?;
    Ok((
        output.status.code(),
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
    ))
}

fn try_parse_json(stdout: &str) -> Option<serde_json::Value> {
    let t = stdout.trim();
    if t.is_empty() {
        return None;
    }
    // Try whole stdout
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(t) {
        if v.is_object() || v.is_array() {
            return Some(v);
        }
    }
    // Last non-empty line
    if let Some(line) = t.lines().rev().find(|l| !l.trim().is_empty()) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(line.trim()) {
            if v.is_object() || v.is_array() {
                return Some(v);
            }
        }
    }
    None
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let mut t: String = s.chars().take(max).collect();
        t.push_str("\n…[truncated]");
        t
    }
}

fn simple_hash(s: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    s.hash(&mut h);
    format!("{:016x}", h.finish())
}

fn err_result(
    entry: &str,
    argv: &[String],
    cwd: &Path,
    error: impl Into<String>,
    started: Instant,
) -> ScriptRunResult {
    let error = error.into();
    ScriptRunResult {
        ok: false,
        runtime: String::new(),
        runtime_path: None,
        entry: entry.to_string(),
        argv: argv.to_vec(),
        cwd: cwd.display().to_string(),
        exit_code: None,
        stdout: String::new(),
        stderr: String::new(),
        duration_ms: started.elapsed().as_millis() as u64,
        parsed_json: None,
        error: Some(error),
    }
}

/// Adapter for agent tool `run_script`.
pub fn run_script_tool(
    ctx: &SkillExecContext<'_>,
    args: &serde_json::Value,
    dry_run: bool,
) -> SkillDispatchResult {
    if !ctx.policy.allow_high_risk {
        return SkillDispatchResult {
            tool: "run_script".into(),
            ok: false,
            message: "run_script requires high-risk skills enabled in Safety policy.".into(),
            data: serde_json::Value::Null,
            dry_run,
        };
    }

    let entry = args
        .get("entry")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let argv: Vec<String> = args
        .get("args")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    // Also accept command line string
    let (entry, argv) = if entry.is_empty() {
        if let Some(cmd) = args.get("command").and_then(|v| v.as_str()) {
            match parse_command_line(cmd) {
                Ok(v) => v,
                Err(e) => {
                    return SkillDispatchResult {
                        tool: "run_script".into(),
                        ok: false,
                        message: e,
                        data: serde_json::Value::Null,
                        dry_run,
                    };
                }
            }
        } else {
            return SkillDispatchResult {
                tool: "run_script".into(),
                ok: false,
                message: "Missing entry or command (e.g. test.php a b c).".into(),
                data: serde_json::Value::Null,
                dry_run,
            };
        }
    } else {
        (entry, argv)
    };

    if dry_run {
        return SkillDispatchResult {
            tool: "run_script".into(),
            ok: true,
            message: format!("Dry-run: would run {entry} {:?}", argv),
            data: serde_json::json!({ "entry": entry, "argv": argv }),
            dry_run: true,
        };
    }

    let Some(workspace) = ctx.workspace_root else {
        return SkillDispatchResult {
            tool: "run_script".into(),
            ok: false,
            message: "Workspace root required.".into(),
            data: serde_json::Value::Null,
            dry_run: false,
        };
    };

    // Prefer skill_id pack root, else scripts/, else workspace skills/
    let skill_id = args
        .get("skill_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let root = if !skill_id.is_empty() {
        let company = workspace.join("skills").join(skill_id);
        if company.is_dir() {
            company
        } else {
            // app_data/skills — parent of companies
            workspace
                .parent() // company_id
                .and_then(|p| p.parent()) // companies
                .and_then(|p| p.parent()) // app_data
                .map(|ad| ad.join("skills").join(skill_id))
                .unwrap_or(company)
        }
    } else {
        let scripts = workspace.join("skills").join("scripts");
        if scripts.is_dir() {
            scripts
        } else {
            let _ = fs::create_dir_all(&scripts);
            scripts
        }
    };

    // app_data: walk up from workspace
    let app_data = workspace
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .unwrap_or(workspace);

    let timeout = args
        .get("timeout_secs")
        .and_then(|v| v.as_u64())
        .unwrap_or(DEFAULT_TIMEOUT_SECS);

    let result = run_script_file(app_data, &root, &entry, &argv, timeout);
    let data = serde_json::to_value(&result).unwrap_or(serde_json::Value::Null);
    SkillDispatchResult {
        tool: "run_script".into(),
        ok: result.ok,
        message: result
            .error
            .clone()
            .unwrap_or_else(|| format!("Script finished exit={:?}", result.exit_code)),
        data,
        dry_run: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_line() {
        let (e, a) = parse_command_line("test.php a b c").unwrap();
        assert_eq!(e, "test.php");
        assert_eq!(a, vec!["a", "b", "c"]);
    }

    #[test]
    fn parses_quotes() {
        let (e, a) = parse_command_line(r#"main.py "hello world" x"#).unwrap();
        assert_eq!(e, "main.py");
        assert_eq!(a, vec!["hello world", "x"]);
    }

    #[test]
    fn jail_blocks_parent() {
        let root = Path::new("/tmp/skill-root-test");
        let _ = fs::create_dir_all(root);
        let err = jail_join(root, "../etc/passwd").unwrap_err();
        assert!(err.contains("escape") || err.contains("Absolute") || err.contains("escape"));
    }
}
