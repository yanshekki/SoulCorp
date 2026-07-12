//! Helpers so command / background failure paths always hit `app_logs`.

use super::{log, log_error, log_warn, LogCategory, LogLevel};
use serde_json::{json, Value};
use tauri::AppHandle;

/// Log an error and return the message (for `return Err(cmd_err(...))`).
pub fn cmd_err(
    app: &AppHandle,
    category: LogCategory,
    source: &str,
    message: impl Into<String>,
) -> String {
    let message = message.into();
    log_error(app, category, source, &message);
    message
}

/// Log a warning and return the message (validation / soft failures).
pub fn cmd_warn(
    app: &AppHandle,
    category: LogCategory,
    source: &str,
    message: impl Into<String>,
) -> String {
    let message = message.into();
    log_warn(app, category, source, &message);
    message
}

/// Log an error with optional detail + meta, return the message.
pub fn cmd_err_detail(
    app: &AppHandle,
    category: LogCategory,
    source: &str,
    message: impl Into<String>,
    detail: Option<&str>,
    meta: Option<Value>,
) -> String {
    let message = message.into();
    log(
        app,
        LogLevel::Error,
        category,
        source,
        &message,
        detail,
        None,
        meta.or_else(|| Some(json!({ "side": "backend" }))),
    );
    message
}

/// Extend `Result<T, String>` so a failed command can log at the boundary.
pub trait LogErr<T> {
    fn log_err(
        self,
        app: &AppHandle,
        category: LogCategory,
        source: &str,
    ) -> Result<T, String>;

    fn log_err_ctx(
        self,
        app: &AppHandle,
        category: LogCategory,
        source: &str,
        ctx: &str,
    ) -> Result<T, String>;
}

/// Expected business / validation failures — warn, not error (keeps Logs page useful).
fn level_for_message(message: &str) -> LogLevel {
    let m = message.to_ascii_lowercase();
    if m.contains("not at the head of the agent's queue")
        || m.contains("execution queue is paused")
        || m.contains("assign an agent before")
        || m.contains("already completed or awaiting review")
        || m.contains("insufficient token")
        || m.contains("not enough tokens")
        || m.contains("company not loaded")
        || m.contains("create a company before")
        || m.contains("work item not found")
        || m.contains("only tasks can be executed")
    {
        LogLevel::Warn
    } else {
        LogLevel::Error
    }
}

impl<T> LogErr<T> for Result<T, String> {
    fn log_err(
        self,
        app: &AppHandle,
        category: LogCategory,
        source: &str,
    ) -> Result<T, String> {
        if let Err(ref err) = self {
            log(
                app,
                level_for_message(err),
                category,
                source,
                err,
                None,
                None,
                Some(json!({ "side": "backend", "command": source })),
            );
        }
        self
    }

    fn log_err_ctx(
        self,
        app: &AppHandle,
        category: LogCategory,
        source: &str,
        ctx: &str,
    ) -> Result<T, String> {
        if let Err(ref err) = self {
            log(
                app,
                level_for_message(err),
                category,
                source,
                err,
                Some(ctx),
                None,
                Some(json!({ "side": "backend", "command": source, "ctx": ctx })),
            );
        }
        self
    }
}

/// Map any error to String, then log on failure.
pub trait LogErrMap<T, E: std::fmt::Display> {
    fn log_err_map(
        self,
        app: &AppHandle,
        category: LogCategory,
        source: &str,
    ) -> Result<T, String>;
}

impl<T, E: std::fmt::Display> LogErrMap<T, E> for Result<T, E> {
    fn log_err_map(
        self,
        app: &AppHandle,
        category: LogCategory,
        source: &str,
    ) -> Result<T, String> {
        self.map_err(|e| e.to_string())
            .log_err(app, category, source)
    }
}
