//! Materialize CLI prompts to temp files so subprocess argv never holds the full body.

use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// How a CLI receives the task prompt (never the full body in argv for file modes).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PromptDelivery {
    /// e.g. grok `--prompt-file PATH`
    PromptFile { flag: String },
    /// e.g. openclaw / aider `--message-file PATH`
    MessageFile { flag: String },
    /// Generic configurable file flag
    FileFlag { flag: String },
    /// Last resort: body on stdin (file still written for observability)
    Stdin,
}

impl PromptDelivery {
    pub fn from_adapter(adapter_id: &str) -> Self {
        match adapter_id.trim() {
            "grok_headless" => Self::PromptFile {
                flag: "--prompt-file".into(),
            },
            "claw_agent_cli" | "aider_message" => Self::MessageFile {
                flag: "--message-file".into(),
            },
            "prompt_flag" => Self::PromptFile {
                flag: "--prompt-file".into(),
            },
            "codex_noninteractive" => Self::Stdin,
            "legacy_stdin" => Self::Stdin,
            _ => Self::Stdin,
        }
    }

    pub fn from_catalog(adapter_id: &str, delivery: Option<&str>, flag: Option<&str>) -> Self {
        let flag = flag.map(str::trim).filter(|s| !s.is_empty());
        match delivery.map(str::trim).unwrap_or("") {
            "prompt_file" => Self::PromptFile {
                flag: flag.unwrap_or("--prompt-file").to_string(),
            },
            "message_file" => Self::MessageFile {
                flag: flag.unwrap_or("--message-file").to_string(),
            },
            "file_flag" => Self::FileFlag {
                flag: flag.unwrap_or("--file").to_string(),
            },
            "stdin" => Self::Stdin,
            _ => Self::from_adapter(adapter_id),
        }
    }

    pub fn is_file_based(&self) -> bool {
        !matches!(self, Self::Stdin)
    }

    pub fn flag(&self) -> Option<&str> {
        match self {
            Self::PromptFile { flag } | Self::MessageFile { flag } | Self::FileFlag { flag } => {
                Some(flag.as_str())
            }
            Self::Stdin => None,
        }
    }
}

/// Temp prompt on disk. Drop removes the directory unless `SOULCORP_KEEP_CLI_PROMPTS=1`.
#[derive(Debug)]
pub struct PromptFile {
    pub dir: PathBuf,
    pub path: PathBuf,
    pub body: String,
    keep: bool,
}

impl PromptFile {
    /// Write `body` to `temp_dir/soulcorp-cli-{prefix}-{uuid}/prompt.md`.
    pub fn write(prefix: &str, body: &str) -> Result<Self, String> {
        let dir = alloc_temp_dir(prefix)?;
        Self::write_into(dir, "prompt.md", body)
    }

    /// Like [`write`], but always keeps the file (for View CLI input observability).
    pub fn write_kept(prefix: &str, body: &str) -> Result<Self, String> {
        let mut file = Self::write(prefix, body)?;
        file.keep = true;
        Ok(file)
    }

    /// Write into an existing temp directory (e.g. claw needs soul.md alongside prompt).
    pub fn write_into(dir: PathBuf, filename: &str, body: &str) -> Result<Self, String> {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create prompt temp dir: {e}"))?;
        let path = dir.join(filename);
        fs::write(&path, body).map_err(|e| format!("Failed to write prompt file: {e}"))?;
        Ok(Self {
            dir,
            path,
            body: body.to_string(),
            keep: keep_cli_prompts(),
        })
    }

    /// Allocate empty `soulcorp-cli-{prefix}-{uuid}` directory for multi-file setups.
    pub fn alloc_dir(prefix: &str) -> Result<PathBuf, String> {
        alloc_temp_dir(prefix)
    }

    pub fn path_str(&self) -> String {
        self.path.display().to_string()
    }

    /// Argv tokens that pass the prompt by path only (never the body).
    pub fn delivery_args(&self, delivery: &PromptDelivery) -> Vec<String> {
        prompt_file_args(delivery, &self.path)
    }

    /// If delivery is Stdin, return body for stdin; otherwise None.
    pub fn stdin_for(&self, delivery: &PromptDelivery) -> Option<String> {
        match delivery {
            PromptDelivery::Stdin => Some(self.body.clone()),
            _ => None,
        }
    }
}

impl Drop for PromptFile {
    fn drop(&mut self) {
        if self.keep {
            return;
        }
        let _ = fs::remove_dir_all(&self.dir);
    }
}

pub fn prompt_file_args(delivery: &PromptDelivery, path: &Path) -> Vec<String> {
    match delivery {
        PromptDelivery::PromptFile { flag }
        | PromptDelivery::MessageFile { flag }
        | PromptDelivery::FileFlag { flag } => {
            vec![flag.clone(), path.display().to_string()]
        }
        PromptDelivery::Stdin => Vec::new(),
    }
}

pub fn keep_cli_prompts() -> bool {
    matches!(
        std::env::var("SOULCORP_KEEP_CLI_PROMPTS")
            .ok()
            .as_deref()
            .map(str::trim),
        Some("1") | Some("true") | Some("yes")
    )
}

fn alloc_temp_dir(prefix: &str) -> Result<PathBuf, String> {
    let safe_prefix: String = prefix
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect();
    let safe_prefix = if safe_prefix.is_empty() {
        "cli".to_string()
    } else {
        safe_prefix
    };
    let dir = std::env::temp_dir().join(format!(
        "soulcorp-cli-{}-{}",
        safe_prefix,
        Uuid::new_v4()
    ));
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create prompt temp dir: {e}"))?;
    Ok(dir)
}

/// Shell-escaped display line for View CLI input (flag + path only).
pub fn format_prompt_delivery_display(delivery: &PromptDelivery, path: &Path) -> String {
    match delivery {
        PromptDelivery::PromptFile { flag }
        | PromptDelivery::MessageFile { flag }
        | PromptDelivery::FileFlag { flag } => {
            format!("{flag} {}", shell_single_quote(&path.display().to_string()))
        }
        PromptDelivery::Stdin => {
            format!(
                "# prompt via stdin (materialized at {})",
                path.display()
            )
        }
    }
}

fn shell_single_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_creates_file_with_body() {
        let pf = PromptFile::write("test", "# hello\n\nworld").expect("write");
        assert!(pf.path.exists());
        let read = fs::read_to_string(&pf.path).expect("read");
        assert_eq!(read, "# hello\n\nworld");
        let dir = pf.dir.clone();
        drop(pf);
        if !keep_cli_prompts() {
            assert!(!dir.exists() || fs::read_dir(&dir).is_err());
        }
    }

    #[test]
    fn delivery_args_never_include_body() {
        let pf = PromptFile::write("grok", "SECRET_PROMPT_BODY_XYZ").expect("write");
        let delivery = PromptDelivery::from_adapter("grok_headless");
        let args = pf.delivery_args(&delivery);
        assert_eq!(args.len(), 2);
        assert_eq!(args[0], "--prompt-file");
        assert!(args[1].ends_with("prompt.md"));
        assert!(!args.iter().any(|a| a.contains("SECRET_PROMPT_BODY_XYZ")));
    }

    #[test]
    fn message_file_flag_for_claw() {
        let d = PromptDelivery::from_adapter("claw_agent_cli");
        assert_eq!(d.flag(), Some("--message-file"));
    }

    #[test]
    fn stdin_returns_body() {
        let pf = PromptFile::write("stdin", "via-stdin").expect("write");
        let d = PromptDelivery::Stdin;
        assert!(pf.delivery_args(&d).is_empty());
        assert_eq!(pf.stdin_for(&d).as_deref(), Some("via-stdin"));
    }
}
