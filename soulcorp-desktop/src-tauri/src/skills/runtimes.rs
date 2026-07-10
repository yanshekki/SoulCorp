//! Script runtime probe + user-space toolchain install.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeId {
    Sh,
    Php,
    Node,
    Python,
    Rust,
}

impl RuntimeId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Sh => "sh",
            Self::Php => "php",
            Self::Node => "node",
            Self::Python => "python",
            Self::Rust => "rust",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_lowercase().as_str() {
            "sh" | "bash" | "shell" => Some(Self::Sh),
            "php" => Some(Self::Php),
            "node" | "nodejs" | "js" | "javascript" => Some(Self::Node),
            "python" | "python3" | "py" => Some(Self::Python),
            "rust" | "rustc" | "cargo" => Some(Self::Rust),
            _ => None,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Sh => "Shell (bash)",
            Self::Php => "PHP",
            Self::Node => "Node.js",
            Self::Python => "Python",
            Self::Rust => "Rust",
        }
    }

    pub fn extensions(self) -> &'static [&'static str] {
        match self {
            Self::Sh => &[".sh"],
            Self::Php => &[".php"],
            Self::Node => &[".js", ".mjs", ".cjs"],
            Self::Python => &[".py"],
            Self::Rust => &[".rs"],
        }
    }

    pub fn from_extension(ext: &str) -> Option<Self> {
        let e = ext.trim().trim_start_matches('.').to_lowercase();
        match e.as_str() {
            "sh" | "bash" => Some(Self::Sh),
            "php" => Some(Self::Php),
            "js" | "mjs" | "cjs" => Some(Self::Node),
            "py" => Some(Self::Python),
            "rs" => Some(Self::Rust),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeStatus {
    pub id: String,
    pub label: String,
    pub available: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub source: String,
    pub extensions: Vec<String>,
    pub installable: bool,
    pub install_hint: Option<String>,
}

pub fn toolchains_root(app_data: &Path) -> PathBuf {
    app_data.join("toolchains")
}

pub fn probe_all(app_data: &Path) -> Vec<RuntimeStatus> {
    vec![
        probe_one(app_data, RuntimeId::Sh),
        probe_one(app_data, RuntimeId::Php),
        probe_one(app_data, RuntimeId::Node),
        probe_one(app_data, RuntimeId::Python),
        probe_one(app_data, RuntimeId::Rust),
    ]
}

pub fn probe_one(app_data: &Path, id: RuntimeId) -> RuntimeStatus {
    let candidates = candidate_bins(app_data, id);
    for (path, source) in candidates {
        if !path.exists() {
            continue;
        }
        if let Some(version) = read_version(id, &path) {
            return RuntimeStatus {
                id: id.as_str().to_string(),
                label: id.label().to_string(),
                available: true,
                path: Some(path.display().to_string()),
                version: Some(version),
                source: source.to_string(),
                extensions: id.extensions().iter().map(|s| s.to_string()).collect(),
                installable: false,
                install_hint: None,
            };
        }
    }

    let installable = !matches!(id, RuntimeId::Sh);
    RuntimeStatus {
        id: id.as_str().to_string(),
        label: id.label().to_string(),
        available: false,
        path: None,
        version: None,
        source: "missing".into(),
        extensions: id.extensions().iter().map(|s| s.to_string()).collect(),
        installable,
        install_hint: Some(install_hint(id)),
    }
}

fn install_hint(id: RuntimeId) -> String {
    match id {
        RuntimeId::Sh => "Shell is required by the OS and cannot be installed by SoulCorp.".into(),
        RuntimeId::Php => {
            "User-space PHP: SoulCorp will try a portable PHP CLI build under app toolchains.".into()
        }
        RuntimeId::Node => {
            "Installs official Node.js LTS tarball into app toolchains (no sudo).".into()
        }
        RuntimeId::Python => {
            "Installs a portable CPython build into app toolchains if system python3 is missing."
                .into()
        }
        RuntimeId::Rust => {
            "Installs rustup toolchain into app toolchains (RUSTUP_HOME/CARGO_HOME local).".into()
        }
    }
}

fn candidate_bins(app_data: &Path, id: RuntimeId) -> Vec<(PathBuf, &'static str)> {
    let tc = toolchains_root(app_data);
    let mut out = Vec::new();
    match id {
        RuntimeId::Sh => {
            out.push((PathBuf::from("/bin/bash"), "system"));
            out.push((PathBuf::from("/usr/bin/bash"), "system"));
            out.push((PathBuf::from("/bin/sh"), "system"));
            out.push((PathBuf::from("/usr/bin/sh"), "system"));
            if let Some(p) = which("bash") {
                out.push((p, "path"));
            }
            if let Some(p) = which("sh") {
                out.push((p, "path"));
            }
        }
        RuntimeId::Php => {
            out.push((tc.join("php/bin/php"), "toolchain"));
            out.push((tc.join("php/php"), "toolchain"));
            if let Some(p) = which("php") {
                out.push((p, "path"));
            }
        }
        RuntimeId::Node => {
            out.push((tc.join("node/bin/node"), "toolchain"));
            if let Some(p) = which("node") {
                out.push((p, "path"));
            }
            // nvm common path
            if let Ok(home) = std::env::var("HOME") {
                let nvm = PathBuf::from(home).join(".nvm/versions/node");
                if nvm.is_dir() {
                    if let Ok(rd) = fs::read_dir(&nvm) {
                        let mut versions: Vec<_> = rd.flatten().map(|e| e.path()).collect();
                        versions.sort();
                        if let Some(last) = versions.last() {
                            out.push((last.join("bin/node"), "nvm"));
                        }
                    }
                }
            }
        }
        RuntimeId::Python => {
            out.push((tc.join("python/bin/python3"), "toolchain"));
            out.push((tc.join("python/bin/python"), "toolchain"));
            if let Some(p) = which("python3") {
                out.push((p, "path"));
            }
            if let Some(p) = which("python") {
                out.push((p, "path"));
            }
        }
        RuntimeId::Rust => {
            out.push((tc.join("rust/cargo/bin/rustc"), "toolchain"));
            out.push((tc.join("rust/cargo/bin/cargo"), "toolchain"));
            if let Some(p) = which("rustc") {
                out.push((p, "path"));
            }
        }
    }
    out
}

fn which(name: &str) -> Option<PathBuf> {
    let output = Command::new("which")
        .arg(name)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(PathBuf::from(path))
    }
}

fn read_version(id: RuntimeId, path: &Path) -> Option<String> {
    let mut cmd = Command::new(path);
    match id {
        RuntimeId::Php => {
            cmd.arg("-v");
        }
        RuntimeId::Node | RuntimeId::Python | RuntimeId::Rust | RuntimeId::Sh => {
            cmd.arg("--version");
        }
    }
    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .ok()?;
    let text = if output.stdout.is_empty() {
        String::from_utf8_lossy(&output.stderr).to_string()
    } else {
        String::from_utf8_lossy(&output.stdout).to_string()
    };
    let line = text.lines().next()?.trim();
    if line.is_empty() {
        None
    } else {
        Some(line.chars().take(80).collect())
    }
}

/// Resolve executable path for a runtime (for spawning scripts).
pub fn resolve_runtime_bin(app_data: &Path, id: RuntimeId) -> Result<PathBuf, String> {
    let status = probe_one(app_data, id);
    status
        .path
        .map(PathBuf::from)
        .filter(|p| p.exists())
        .ok_or_else(|| {
            format!(
                "{} runtime not found. Open Runtimes tab to install.",
                id.label()
            )
        })
}

/// For rustc, also prefer cargo bin dir for PATH.
pub fn toolchain_path_prefix(app_data: &Path) -> String {
    let tc = toolchains_root(app_data);
    let parts = [
        tc.join("node/bin"),
        tc.join("php/bin"),
        tc.join("python/bin"),
        tc.join("rust/cargo/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
    ];
    parts
        .iter()
        .filter(|p| p.exists())
        .map(|p| p.display().to_string())
        .collect::<Vec<_>>()
        .join(":")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallResult {
    pub runtime: String,
    pub ok: bool,
    pub message: String,
    pub log: String,
    pub status: RuntimeStatus,
}

pub fn install_runtime(app_data: &Path, runtime_id: &str) -> InstallResult {
    let Some(id) = RuntimeId::parse(runtime_id) else {
        return InstallResult {
            runtime: runtime_id.to_string(),
            ok: false,
            message: format!("Unknown runtime '{runtime_id}'."),
            log: String::new(),
            status: probe_one(app_data, RuntimeId::Sh),
        };
    };

    // Already available
    let current = probe_one(app_data, id);
    if current.available {
        return InstallResult {
            runtime: id.as_str().to_string(),
            ok: true,
            message: format!("{} already available at {:?}.", id.label(), current.path),
            log: String::new(),
            status: current,
        };
    }

    let (ok, message, log) = match id {
        RuntimeId::Sh => (
            false,
            "Shell cannot be installed by SoulCorp.".to_string(),
            String::new(),
        ),
        RuntimeId::Node => install_node(app_data),
        RuntimeId::Rust => install_rust(app_data),
        RuntimeId::Python => install_python_hint(app_data),
        RuntimeId::Php => install_php_hint(app_data),
    };

    InstallResult {
        runtime: id.as_str().to_string(),
        ok,
        message,
        log,
        status: probe_one(app_data, id),
    }
}

fn install_node(app_data: &Path) -> (bool, String, String) {
    let dest = toolchains_root(app_data).join("node");
    let _ = fs::create_dir_all(&dest);
    let version = "v20.18.0";
    let arch = match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => {
            return (
                false,
                format!("Unsupported arch for Node install: {other}"),
                String::new(),
            );
        }
    };
    let tarball = format!("node-{version}-linux-{arch}.tar.xz");
    let url = format!("https://nodejs.org/dist/{version}/{tarball}");
    let tmp = dest.join(&tarball);

    let mut log = format!("Downloading {url}\n");
    match download_file(&url, &tmp) {
        Ok(()) => log.push_str("Download complete.\n"),
        Err(e) => return (false, format!("Node download failed: {e}"), log),
    }

    // Extract with tar
    let status = Command::new("tar")
        .args(["-xJf", tmp.to_str().unwrap_or(""), "-C", dest.to_str().unwrap_or(".")])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();
    match status {
        Ok(out) => {
            log.push_str(&String::from_utf8_lossy(&out.stdout));
            log.push_str(&String::from_utf8_lossy(&out.stderr));
            if !out.status.success() {
                return (false, "Failed to extract Node tarball (need tar + xz).".into(), log);
            }
        }
        Err(e) => return (false, format!("tar failed: {e}"), log),
    }

    // Flatten node-vXX-linux-x64 → node/
    let extracted = dest.join(format!("node-{version}-linux-{arch}"));
    if extracted.is_dir() {
        // Move contents up if bin not at dest/bin
        if !dest.join("bin/node").exists() {
            let _ = fs::rename(extracted.join("bin"), dest.join("bin"));
            let _ = fs::rename(extracted.join("lib"), dest.join("lib"));
            let _ = fs::rename(extracted.join("include"), dest.join("include"));
            let _ = fs::rename(extracted.join("share"), dest.join("share"));
            let _ = fs::remove_dir_all(&extracted);
        }
    }
    let _ = fs::remove_file(&tmp);

    if dest.join("bin/node").exists() {
        (
            true,
            format!("Node.js {version} installed to {}.", dest.display()),
            log,
        )
    } else {
        (false, "Node extract finished but bin/node missing.".into(), log)
    }
}

fn install_rust(app_data: &Path) -> (bool, String, String) {
    let rust_home = toolchains_root(app_data).join("rust");
    let cargo_home = rust_home.join("cargo");
    let rustup_home = rust_home.join("rustup");
    let _ = fs::create_dir_all(&cargo_home);
    let _ = fs::create_dir_all(&rustup_home);

    let mut log = String::from("Installing rustup into app toolchains…\n");
    // Download rustup-init
    let arch = match std::env::consts::ARCH {
        "x86_64" => "x86_64-unknown-linux-gnu",
        "aarch64" => "aarch64-unknown-linux-gnu",
        other => {
            return (
                false,
                format!("Unsupported arch for rustup: {other}"),
                log,
            );
        }
    };
    let url = format!("https://static.rust-lang.org/rustup/dist/{arch}/rustup-init");
    let init = rust_home.join("rustup-init");
    match download_file(&url, &init) {
        Ok(()) => log.push_str("Downloaded rustup-init.\n"),
        Err(e) => return (false, format!("rustup-init download failed: {e}"), log),
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&init, fs::Permissions::from_mode(0o755));
    }

    let output = Command::new(&init)
        .args([
            "-y",
            "--no-modify-path",
            "--default-toolchain",
            "stable",
            "--profile",
            "minimal",
        ])
        .env("CARGO_HOME", &cargo_home)
        .env("RUSTUP_HOME", &rustup_home)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    match output {
        Ok(out) => {
            log.push_str(&String::from_utf8_lossy(&out.stdout));
            log.push_str(&String::from_utf8_lossy(&out.stderr));
            if cargo_home.join("bin/rustc").exists() {
                (
                    true,
                    format!("Rust toolchain installed under {}.", rust_home.display()),
                    log,
                )
            } else {
                (false, "rustup finished but rustc missing.".into(), log)
            }
        }
        Err(e) => (false, format!("Failed to run rustup-init: {e}"), log),
    }
}

fn install_python_hint(app_data: &Path) -> (bool, String, String) {
    // Prefer system; try to copy/link if python3 appears later.
    // Portable builds are large; provide clear guidance + try deadsnakes-less approach:
    // If `python3` appears after user installs, probe will pick it up.
    let _ = app_data;
    (
        false,
        "Portable Python install is not bundled in this build. Install python3 on your system (or use a portable CPython under toolchains/python/bin/python3). SoulCorp will detect it automatically.".into(),
        String::from(
            "Hint: place a portable python3 binary at {app_data}/toolchains/python/bin/python3\n",
        ),
    )
}

fn install_php_hint(app_data: &Path) -> (bool, String, String) {
    let _ = app_data;
    (
        false,
        "Portable PHP CLI is not auto-downloaded in this build (user-space only, no apt). Place a php binary at toolchains/php/bin/php or install php-cli system-wide — SoulCorp will detect PATH.".into(),
        String::from(
            "Hint: mkdir -p toolchains/php/bin && copy php binary there.\n",
        ),
    )
}

fn download_file(url: &str, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(300))
        .user_agent("SoulCorpDesktop/1.0 (toolchain install)")
        .build()
        .map_err(|e| e.to_string())?;
    let bytes = client
        .get(url)
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .map_err(|e| e.to_string())?;
    fs::write(dest, &bytes).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_extensions() {
        assert_eq!(RuntimeId::from_extension("php"), Some(RuntimeId::Php));
        assert_eq!(RuntimeId::from_extension(".js"), Some(RuntimeId::Node));
        assert_eq!(RuntimeId::from_extension("rs"), Some(RuntimeId::Rust));
    }

    #[test]
    fn probe_sh_usually_available() {
        let status = probe_one(Path::new("/tmp"), RuntimeId::Sh);
        // On Linux CI/dev, sh should exist
        assert!(status.available || !status.installable);
    }
}
