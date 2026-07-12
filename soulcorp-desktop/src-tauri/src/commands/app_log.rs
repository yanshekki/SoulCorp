use crate::app_log::{
    self, AppLogPage, AppLogQuery, AppLogStats, AppendAppLogRequest, LogCategory, LogLevel,
};
use serde_json::json;
use tauri::AppHandle;

#[tauri::command]
pub fn list_app_logs(app: AppHandle, query: AppLogQuery) -> Result<AppLogPage, String> {
    app_log::query(&app, query)
}

#[tauri::command]
pub fn get_app_log_stats(app: AppHandle) -> Result<AppLogStats, String> {
    app_log::stats(&app)
}

#[tauri::command]
pub fn clear_app_logs(
    app: AppHandle,
    level: Option<String>,
    category: Option<String>,
) -> Result<u32, String> {
    app_log::clear(
        &app,
        level.as_deref(),
        category.as_deref(),
    )
}

#[tauri::command]
pub fn export_app_logs(app: AppHandle, query: AppLogQuery) -> Result<String, String> {
    app_log::export_json(&app, query)
}

#[tauri::command]
pub fn append_app_log(app: AppHandle, entry: AppendAppLogRequest) -> Result<(), String> {
    let level = LogLevel::parse(&entry.level).ok_or_else(|| {
        format!("Invalid log level '{}'. Use error|warn|info.", entry.level)
    })?;
    let category = LogCategory::parse(&entry.category).ok_or_else(|| {
        format!(
            "Invalid log category '{}'.",
            entry.category
        )
    })?;
    let message = entry.message.trim();
    if message.is_empty() {
        return Err("Log message cannot be empty.".into());
    }
    let source = if entry.source.trim().is_empty() {
        "frontend"
    } else {
        entry.source.trim()
    };
    let meta = entry.meta.or_else(|| Some(json!({ "side": "frontend" })));
    app_log::log(
        &app,
        level,
        category,
        source,
        message,
        entry.detail.as_deref(),
        entry.company_id.as_deref(),
        meta,
    );
    Ok(())
}
