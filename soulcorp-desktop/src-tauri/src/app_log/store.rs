use super::types::{
    AppLogEntry, AppLogPage, AppLogQuery, AppLogStats, CategoryCount, LogCategory, LogLevel,
};
use chrono::Utc;
use rusqlite::{params, params_from_iter, Connection};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

pub const MAX_LOG_ROWS: u32 = 5000;
/// Cap stored text size so a huge stack cannot bloat the DB.
pub const MAX_FIELD_CHARS: usize = 8 * 1024;
/// Run prune every N successful inserts (always if over soft threshold).
const PRUNE_EVERY_N: u32 = 32;

static APPEND_COUNT: AtomicU32 = AtomicU32::new(0);

const LOG_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS app_logs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    level TEXT NOT NULL,
    category TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL,
    detail TEXT,
    company_id TEXT,
    meta_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON app_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs(level);
CREATE INDEX IF NOT EXISTS idx_app_logs_category ON app_logs(category);
CREATE INDEX IF NOT EXISTS idx_app_logs_company ON app_logs(company_id);
"#;

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    crate::db::database_path(app)
}

fn open_conn(app: &AppHandle) -> Result<Connection, String> {
    let path = database_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(LOG_SCHEMA).map_err(|e| e.to_string())?;
    Ok(conn)
}

fn truncate_field(text: String) -> String {
    if text.chars().count() <= MAX_FIELD_CHARS {
        return text;
    }
    let truncated: String = text.chars().take(MAX_FIELD_CHARS).collect();
    format!("{truncated}\n…[truncated]")
}

/// Redact secrets and cap field size before persistence.
pub fn sanitize_log_text(text: &str) -> String {
    truncate_field(redact_secrets(text))
}

fn redact_secrets(text: &str) -> String {
    let mut out = text.to_string();

    // Prefix-style secrets (scan repeatedly).
    for key in [
        "sk-",
        "Bearer ",
        "bearer ",
        "api_key=",
        "apikey=",
        "api-key=",
        "apiKey=",
        "authorization=",
        "password=",
        "secret=",
        "token=",
    ] {
        let mut search_from = 0;
        while let Some(rel) = out[search_from..].find(key) {
            let idx = search_from + rel;
            let start = idx + key.len();
            // Redact until whitespace / quote / end (up to 48 chars).
            let rest = &out[start..];
            let take = rest
                .chars()
                .take_while(|c| !c.is_whitespace() && *c != '"' && *c != '\'' && *c != ',' && *c != '}')
                .take(64)
                .count();
            let end = start
                + rest
                    .char_indices()
                    .take(take)
                    .last()
                    .map(|(i, c)| i + c.len_utf8())
                    .unwrap_or(0);
            if end > start {
                out.replace_range(start..end, "********");
                search_from = start + 8;
            } else {
                break;
            }
        }
    }

    // JSON-ish "api_key":"...." patterns
    for field in [
        "api_key",
        "apiKey",
        "authorization",
        "password",
        "secret",
        "access_token",
        "refresh_token",
    ] {
        let patterns = [
            format!("\"{field}\":\""),
            format!("\"{field}\": \""),
            format!("{field}=\""),
        ];
        for pat in patterns {
            let mut search_from = 0;
            while let Some(rel) = out[search_from..].find(&pat) {
                let idx = search_from + rel;
                let start = idx + pat.len();
                if let Some(end_rel) = out[start..].find('"') {
                    let end = start + end_rel;
                    if end > start {
                        out.replace_range(start..end, "********");
                    }
                    search_from = start + 8;
                } else {
                    break;
                }
            }
        }
    }

    out
}

pub fn append(
    app: &AppHandle,
    level: LogLevel,
    category: LogCategory,
    source: &str,
    message: &str,
    detail: Option<&str>,
    company_id: Option<&str>,
    meta: Option<Value>,
) {
    let message = sanitize_log_text(message);
    let detail = detail.map(sanitize_log_text);
    // Always mirror to stderr for dev runs.
    eprintln!(
        "[{} {}] {}: {}",
        level.as_str(),
        category.as_str(),
        source,
        message
    );
    if let Some(ref d) = detail {
        if !d.is_empty() {
            eprintln!("  detail: {d}");
        }
    }

    let result = (|| -> Result<(), String> {
        let conn = open_conn(app)?;
        let id = format!("log-{}", Uuid::new_v4());
        let created_at = Utc::now().to_rfc3339();
        let meta_json = meta
            .as_ref()
            .and_then(|v| serde_json::to_string(v).ok());
        conn.execute(
            "INSERT INTO app_logs (id, created_at, level, category, source, message, detail, company_id, meta_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                created_at,
                level.as_str(),
                category.as_str(),
                source,
                message,
                detail,
                company_id,
                meta_json,
            ],
        )
        .map_err(|e| e.to_string())?;
        let n = APPEND_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
        if n % PRUNE_EVERY_N == 0 {
            prune(&conn)?;
        } else {
            // Cheap check: if we might be near cap, prune anyway occasionally via count.
            let count: u32 = conn
                .query_row("SELECT COUNT(*) FROM app_logs", [], |row| row.get(0))
                .unwrap_or(0);
            if count > MAX_LOG_ROWS {
                prune(&conn)?;
            }
        }
        Ok(())
    })();

    if let Err(err) = result {
        eprintln!("[app_log] failed to persist log: {err}");
    }
}

/// Export matching logs to a JSON file under the app exports directory.
pub fn export_json(app: &AppHandle, query: AppLogQuery) -> Result<String, String> {
    let page = self::query(
        app,
        AppLogQuery {
            limit: Some(query.limit.unwrap_or(2000).min(5000)),
            offset: Some(0),
            ..query
        },
    )?;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("exports");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let path = dir.join(format!("app-logs-{stamp}.json"));
    let payload = serde_json::json!({
        "exported_at": Utc::now().to_rfc3339(),
        "total": page.total,
        "count": page.items.len(),
        "items": page.items,
    });
    std::fs::write(
        &path,
        serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

fn prune(conn: &Connection) -> Result<(), String> {
    let count: u32 = conn
        .query_row("SELECT COUNT(*) FROM app_logs", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if count <= MAX_LOG_ROWS {
        return Ok(());
    }
    let overflow = count - MAX_LOG_ROWS;
    conn.execute(
        "DELETE FROM app_logs WHERE id IN (
            SELECT id FROM app_logs ORDER BY created_at ASC LIMIT ?1
        )",
        params![overflow],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn query(app: &AppHandle, query: AppLogQuery) -> Result<AppLogPage, String> {
    let conn = open_conn(app)?;
    let limit = query.limit.unwrap_or(100).clamp(1, 500);
    let offset = query.offset.unwrap_or(0);

    let mut where_parts: Vec<String> = Vec::new();
    let mut params_vec: Vec<String> = Vec::new();

    if let Some(level) = query.level.as_ref().map(|s| s.trim().to_ascii_lowercase()) {
        if level != "all" && !level.is_empty() {
            where_parts.push("level = ?".into());
            params_vec.push(level);
        }
    }
    if let Some(category) = query
        .category
        .as_ref()
        .map(|s| s.trim().to_ascii_lowercase())
    {
        if category != "all" && !category.is_empty() {
            where_parts.push("category = ?".into());
            params_vec.push(category);
        }
    }
    if let Some(company_id) = query.company_id.as_ref().map(|s| s.trim().to_string()) {
        if company_id != "all" && !company_id.is_empty() {
            where_parts.push("company_id = ?".into());
            params_vec.push(company_id);
        }
    }
    if let Some(from) = query.from.as_ref().map(|s| s.trim().to_string()) {
        if !from.is_empty() {
            where_parts.push("created_at >= ?".into());
            params_vec.push(from);
        }
    }
    if let Some(to) = query.to.as_ref().map(|s| s.trim().to_string()) {
        if !to.is_empty() {
            where_parts.push("created_at <= ?".into());
            params_vec.push(to);
        }
    }
    if let Some(q) = query.q.as_ref().map(|s| s.trim().to_string()) {
        if !q.is_empty() {
            where_parts.push(
                "(message LIKE ? OR source LIKE ? OR IFNULL(detail,'') LIKE ? OR IFNULL(company_id,'') LIKE ?)"
                    .into(),
            );
            let like = format!("%{q}%");
            params_vec.push(like.clone());
            params_vec.push(like.clone());
            params_vec.push(like.clone());
            params_vec.push(like);
        }
    }

    let where_sql = if where_parts.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_parts.join(" AND "))
    };

    let total: u32 = {
        let sql = format!("SELECT COUNT(*) FROM app_logs {where_sql}");
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        stmt.query_row(params_from_iter(params_vec.iter()), |row| row.get(0))
            .map_err(|e| e.to_string())?
    };

    let list_sql = format!(
        "SELECT id, created_at, level, category, source, message, detail, company_id, meta_json
         FROM app_logs {where_sql}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?"
    );
    let mut list_params = params_vec.clone();
    list_params.push(limit.to_string());
    list_params.push(offset.to_string());

    let mut stmt = conn.prepare(&list_sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_from_iter(list_params.iter()), |row| {
            let meta_json: Option<String> = row.get(8)?;
            let meta = meta_json
                .as_ref()
                .and_then(|s| serde_json::from_str::<Value>(s).ok());
            Ok(AppLogEntry {
                id: row.get(0)?,
                created_at: row.get(1)?,
                level: row.get(2)?,
                category: row.get(3)?,
                source: row.get(4)?,
                message: row.get(5)?,
                detail: row.get(6)?,
                company_id: row.get(7)?,
                meta,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| e.to_string())?);
    }

    Ok(AppLogPage {
        items,
        total,
        limit,
        offset,
    })
}

pub fn stats(app: &AppHandle) -> Result<AppLogStats, String> {
    let conn = open_conn(app)?;
    let total: u32 = conn
        .query_row("SELECT COUNT(*) FROM app_logs", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    let error: u32 = conn
        .query_row(
            "SELECT COUNT(*) FROM app_logs WHERE level = 'error'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let warn: u32 = conn
        .query_row(
            "SELECT COUNT(*) FROM app_logs WHERE level = 'warn'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let info: u32 = conn
        .query_row(
            "SELECT COUNT(*) FROM app_logs WHERE level = 'info'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT category, COUNT(*) FROM app_logs GROUP BY category ORDER BY COUNT(*) DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(CategoryCount {
                category: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut by_category = Vec::new();
    for row in rows {
        by_category.push(row.map_err(|e| e.to_string())?);
    }

    Ok(AppLogStats {
        total,
        error,
        warn,
        info,
        by_category,
    })
}

pub fn clear(app: &AppHandle, level: Option<&str>, category: Option<&str>) -> Result<u32, String> {
    let conn = open_conn(app)?;
    let mut where_parts: Vec<String> = Vec::new();
    let mut params_vec: Vec<String> = Vec::new();
    if let Some(level) = level.map(|s| s.trim().to_ascii_lowercase()) {
        if level != "all" && !level.is_empty() {
            where_parts.push("level = ?".into());
            params_vec.push(level);
        }
    }
    if let Some(category) = category.map(|s| s.trim().to_ascii_lowercase()) {
        if category != "all" && !category.is_empty() {
            where_parts.push("category = ?".into());
            params_vec.push(category);
        }
    }
    let sql = if where_parts.is_empty() {
        "DELETE FROM app_logs".to_string()
    } else {
        format!("DELETE FROM app_logs WHERE {}", where_parts.join(" AND "))
    };
    let deleted = if params_vec.is_empty() {
        conn.execute(&sql, []).map_err(|e| e.to_string())?
    } else {
        conn.execute(&sql, params_from_iter(params_vec.iter()))
            .map_err(|e| e.to_string())?
    };
    Ok(deleted as u32)
}

pub fn ensure_ready(app: &AppHandle) -> Result<(), String> {
    let _ = open_conn(app)?;
    Ok(())
}

/// Soft check used by tests / health.
#[allow(dead_code)]
pub fn count_all(app: &AppHandle) -> Result<u32, String> {
    let conn = open_conn(app)?;
    conn.query_row("SELECT COUNT(*) FROM app_logs", [], |row| row.get(0))
        .map_err(|e| e.to_string())
}
