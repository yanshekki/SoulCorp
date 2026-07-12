mod result_ext;
mod store;
mod types;

pub use result_ext::{cmd_err, cmd_err_detail, cmd_warn, LogErr, LogErrMap};
pub use types::{
    AppLogEntry, AppLogPage, AppLogQuery, AppLogStats, AppendAppLogRequest, CategoryCount,
    LogCategory, LogLevel,
};

use serde_json::Value;
use std::sync::OnceLock;
use tauri::AppHandle;

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

/// Call once during app setup so lock_util / background threads can log without an AppHandle.
pub fn set_app_handle(app: AppHandle) {
    let _ = APP_HANDLE.set(app);
}

pub fn app_handle() -> Option<&'static AppHandle> {
    APP_HANDLE.get()
}

fn with_app(f: impl FnOnce(&AppHandle)) {
    if let Some(app) = APP_HANDLE.get() {
        f(app);
    }
}

/// Install a process-wide panic hook that best-effort records panics into app_logs.
/// Safe to call once at process start (before or after set_app_handle).
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".into());
        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Box<Any>".into()
        };
        let message = format!("panic at {location}: {payload}");
        eprintln!("[error system] panic: {message}");
        // Best-effort: may no-op if AppHandle not ready or DB locked during unwind.
        log_global(
            LogLevel::Error,
            LogCategory::System,
            "panic",
            &message,
            Some(&location),
        );
        previous(info);
    }));
}

/// Persist + stderr log (never panics).
pub fn log(
    app: &AppHandle,
    level: LogLevel,
    category: LogCategory,
    source: &str,
    message: impl AsRef<str>,
    detail: Option<&str>,
    company_id: Option<&str>,
    meta: Option<Value>,
) {
    store::append(
        app,
        level,
        category,
        source,
        message.as_ref(),
        detail,
        company_id,
        meta,
    );
}

/// Log using the global AppHandle if setup has run.
pub fn log_global(
    level: LogLevel,
    category: LogCategory,
    source: &str,
    message: impl AsRef<str>,
    detail: Option<&str>,
) {
    let msg = message.as_ref();
    eprintln!(
        "[{} {}] {}: {}",
        level.as_str(),
        category.as_str(),
        source,
        msg
    );
    with_app(|app| {
        store::append(app, level, category, source, msg, detail, None, None);
    });
}

pub fn log_error(
    app: &AppHandle,
    category: LogCategory,
    source: &str,
    message: impl AsRef<str>,
) {
    log(
        app,
        LogLevel::Error,
        category,
        source,
        message,
        None,
        None,
        None,
    );
}

pub fn log_error_detail(
    app: &AppHandle,
    category: LogCategory,
    source: &str,
    message: impl AsRef<str>,
    detail: impl AsRef<str>,
) {
    log(
        app,
        LogLevel::Error,
        category,
        source,
        message,
        Some(detail.as_ref()),
        None,
        None,
    );
}

pub fn log_warn(
    app: &AppHandle,
    category: LogCategory,
    source: &str,
    message: impl AsRef<str>,
) {
    log(
        app,
        LogLevel::Warn,
        category,
        source,
        message,
        None,
        None,
        None,
    );
}

pub fn log_info(
    app: &AppHandle,
    category: LogCategory,
    source: &str,
    message: impl AsRef<str>,
) {
    log(
        app,
        LogLevel::Info,
        category,
        source,
        message,
        None,
        None,
        None,
    );
}

pub fn query(app: &AppHandle, query: AppLogQuery) -> Result<AppLogPage, String> {
    store::query(app, query)
}

pub fn stats(app: &AppHandle) -> Result<AppLogStats, String> {
    store::stats(app)
}

pub fn clear(
    app: &AppHandle,
    level: Option<&str>,
    category: Option<&str>,
) -> Result<u32, String> {
    store::clear(app, level, category)
}

pub fn export_json(app: &AppHandle, query: AppLogQuery) -> Result<String, String> {
    store::export_json(app, query)
}

pub fn ensure_ready(app: &AppHandle) -> Result<(), String> {
    store::ensure_ready(app)
}
