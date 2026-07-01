use crate::state::{summary_from_state, AppState, CompanyRegistry, CompanySummary};
use chrono::Utc;
use rusqlite::{Connection, OptionalExtension};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex as StdMutex;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use super::database_path;

const COMMIT_DEBOUNCE_TICKS: u64 = 5;

const SNAPSHOT_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS app_snapshot (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS company_registry (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    registry_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS company_snapshots (
    company_id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"#;

fn open_connection(app: &AppHandle) -> Result<Connection, String> {
    let path = database_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(SNAPSHOT_SQL)
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

struct PendingCommit {
    company_id: String,
    last_committed_tick: u64,
    last_committed_day: u32,
}

static PENDING_COMMIT: StdMutex<Option<PendingCommit>> = StdMutex::new(None);

pub fn reset_commit_debounce(company_id: &str) {
    if let Ok(mut guard) = PENDING_COMMIT.lock() {
        *guard = Some(PendingCommit {
            company_id: company_id.to_string(),
            last_committed_tick: 0,
            last_committed_day: 0,
        });
    }
}

pub fn commit_debounced(app: AppHandle, state: &AppState) -> Result<(), String> {
    let force = {
        let mut guard = PENDING_COMMIT.lock().map_err(|e| e.to_string())?;
        let entry = guard.get_or_insert(PendingCommit {
            company_id: state.company_id.clone(),
            last_committed_tick: 0,
            last_committed_day: 0,
        });

        let company_changed = entry.company_id != state.company_id;
        let day_changed = state.day_number != entry.last_committed_day;
        let tick_delta = if company_changed {
            COMMIT_DEBOUNCE_TICKS
        } else {
            state.tick.saturating_sub(entry.last_committed_tick)
        };
        let should_commit = company_changed || day_changed || tick_delta >= COMMIT_DEBOUNCE_TICKS;

        if should_commit {
            entry.company_id = state.company_id.clone();
            entry.last_committed_tick = state.tick;
            entry.last_committed_day = state.day_number;
            true
        } else {
            false
        }
    };

    if force {
        commit(app, state)
    } else {
        Ok(())
    }
}

pub fn flush_pending_commit(app: AppHandle, state: &AppState) -> Result<(), String> {
    reset_commit_debounce(&state.company_id);
    commit(app, state)
}

fn load_registry_conn(conn: &Connection) -> Result<CompanyRegistry, String> {
    let mut stmt = conn
        .prepare("SELECT registry_json FROM company_registry WHERE id = 1")
        .map_err(|e| e.to_string())?;

    match stmt
        .query_row([], |row| row.get::<_, String>(0))
        .optional()
        .map_err(|e| e.to_string())?
    {
        Some(json) => serde_json::from_str(&json).map_err(|e| e.to_string()),
        None => Ok(CompanyRegistry::default()),
    }
}

pub fn load_registry(app: &AppHandle) -> Result<CompanyRegistry, String> {
    let conn = open_connection(app)?;
    load_registry_conn(&conn)
}

pub fn save_registry(app: &AppHandle, registry: &CompanyRegistry) -> Result<(), String> {
    let conn = open_connection(app)?;
    let json = serde_json::to_string(registry).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO company_registry (id, registry_json, updated_at)
         VALUES (1, ?1, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           registry_json = excluded.registry_json,
           updated_at = excluded.updated_at",
        [&json],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn load_company_state(app: &AppHandle, company_id: &str) -> Result<Option<AppState>, String> {
    let conn = open_connection(app)?;
    let mut stmt = conn
        .prepare("SELECT state_json FROM company_snapshots WHERE company_id = ?1")
        .map_err(|e| e.to_string())?;

    match stmt
        .query_row([company_id], |row| row.get::<_, String>(0))
        .optional()
        .map_err(|e| e.to_string())?
    {
        Some(json) => {
            let state: AppState = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            Ok(Some(state))
        }
        None => Ok(None),
    }
}

pub fn persist_company_state(app: &AppHandle, company_id: &str, state: &AppState) -> Result<(), String> {
    let conn = open_connection(app)?;
    let json = serde_json::to_string(state).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO company_snapshots (company_id, state_json, updated_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(company_id) DO UPDATE SET
           state_json = excluded.state_json,
           updated_at = excluded.updated_at",
        (company_id, json),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn load_legacy_app_state(app: &AppHandle) -> Result<Option<AppState>, String> {
    let conn = open_connection(app)?;
    let mut stmt = conn
        .prepare("SELECT state_json FROM app_snapshot WHERE id = 1")
        .map_err(|e| e.to_string())?;

    match stmt
        .query_row([], |row| row.get::<_, String>(0))
        .optional()
        .map_err(|e| e.to_string())?
    {
        Some(json) => {
            let state: AppState = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            Ok(Some(state))
        }
        None => Ok(None),
    }
}

fn companies_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("companies"))
}

fn legacy_workspace_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("workspaces"))
}

pub fn company_workspace_root(app: &AppHandle, company_id: &str) -> Result<PathBuf, String> {
    Ok(companies_root(app)?.join(company_id).join("workspace"))
}

fn migrate_legacy_workspace(app: &AppHandle, company_id: &str) -> Result<(), String> {
    let legacy = legacy_workspace_root(app)?;
    let target = company_workspace_root(app, company_id)?;
    if !legacy.exists() {
        return Ok(());
    }
    if target.exists() {
        return Ok(());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&legacy, &target).or_else(|_| {
        fs::create_dir_all(&target).map_err(|e| e.to_string())?;
        copy_dir_recursive(&legacy, &target)?;
        fs::remove_dir_all(&legacy).map_err(|e| e.to_string())?;
        Ok(())
    })
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let target = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn ensure_company_id(state: &mut AppState) -> String {
    if state.company_id.is_empty() {
        state.company_id = Uuid::new_v4().to_string();
    }
    if state.company_created_at.is_none() {
        state.company_created_at = Some(Utc::now().to_rfc3339());
    }
    state.company_id.clone()
}

fn migrate_legacy_snapshot(app: &AppHandle, mut state: AppState) -> Result<(CompanyRegistry, AppState), String> {
    let company_id = ensure_company_id(&mut state);
    migrate_legacy_workspace(app, &company_id)?;
    persist_company_state(app, &company_id, &state)?;

    let summary = summary_from_state(&state);
    let registry = CompanyRegistry {
        active_company_id: Some(company_id.clone()),
        companies: vec![summary],
    };
    save_registry(app, &registry)?;
    Ok((registry, state))
}

pub fn bootstrap_companies(app: &AppHandle) -> Result<(CompanyRegistry, AppState), String> {
    let mut registry = load_registry(app)?;

    if !registry.companies.is_empty() {
        let active_id = registry
            .active_company_id
            .clone()
            .or_else(|| registry.companies.first().map(|company| company.id.clone()))
            .ok_or_else(|| "Company registry is empty.".to_string())?;

        let mut state = load_company_state(app, &active_id)?
            .ok_or_else(|| format!("Missing snapshot for company {active_id}"))?;
        state.company_id = active_id.clone();
        registry.active_company_id = Some(active_id);
        save_registry(app, &registry)?;
        return Ok((registry, state));
    }

    if let Some(legacy_state) = load_legacy_app_state(app)? {
        return migrate_legacy_snapshot(app, legacy_state);
    }

    Ok((CompanyRegistry::default(), AppState::default()))
}

pub fn commit(app: AppHandle, state: &AppState) -> Result<(), String> {
    if state.company_id.is_empty() {
        return Err("Cannot persist company state without company_id.".to_string());
    }

    let conn = open_connection(&app)?;
    let state_json = serde_json::to_string(state).map_err(|e| e.to_string())?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| e.to_string())?;

    let persist_result = (|| -> Result<(), String> {
        tx.execute(
            "INSERT INTO company_snapshots (company_id, state_json, updated_at)
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(company_id) DO UPDATE SET
               state_json = excluded.state_json,
               updated_at = excluded.updated_at",
            (&state.company_id, state_json),
        )
        .map_err(|e| e.to_string())?;

        let mut registry = load_registry_conn(&tx)?;
        registry.upsert_summary(summary_from_state(state));
        registry.active_company_id = Some(state.company_id.clone());
        let registry_json = serde_json::to_string(&registry).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO company_registry (id, registry_json, updated_at)
             VALUES (1, ?1, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               registry_json = excluded.registry_json,
               updated_at = excluded.updated_at",
            [&registry_json],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })();

    match persist_result {
        Ok(()) => tx.commit().map_err(|e| e.to_string()),
        Err(error) => {
            let _ = tx.rollback();
            Err(error)
        }
    }
}

pub fn switch_active_company(
    app: &AppHandle,
    current: &AppState,
    target_company_id: &str,
) -> Result<AppState, String> {
    if current.company_id.is_empty() {
        return Err("Current company is not initialized.".to_string());
    }
    persist_company_state(app, &current.company_id, current)?;

    let mut registry = load_registry(app)?;
    registry.active_company_id = Some(target_company_id.to_string());
    save_registry(app, &registry)?;

    let mut next = load_company_state(app, target_company_id)?
        .ok_or_else(|| format!("Company {target_company_id} not found."))?;
    next.company_id = target_company_id.to_string();
    Ok(next)
}

pub fn clear_all_persisted_data(app: &AppHandle) -> Result<(), String> {
    let registry = load_registry(app)?;
    for company in &registry.companies {
        let _ = delete_company_snapshot(app, &company.id);
    }

    let conn = open_connection(app)?;
    conn.execute("DELETE FROM company_snapshots", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM company_registry WHERE id = 1", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM app_snapshot WHERE id = 1", [])
        .map_err(|e| e.to_string())?;

    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let companies_dir = data_dir.join("companies");
    if companies_dir.exists() {
        fs::remove_dir_all(companies_dir).map_err(|e| e.to_string())?;
    }
    let legacy_workspaces = data_dir.join("workspaces");
    if legacy_workspaces.exists() {
        fs::remove_dir_all(legacy_workspaces).map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn delete_company_snapshot(app: &AppHandle, company_id: &str) -> Result<(), String> {
    let conn = open_connection(app)?;
    conn.execute(
        "DELETE FROM company_snapshots WHERE company_id = ?1",
        [company_id],
    )
    .map_err(|e| e.to_string())?;

    let workspace_dir = company_workspace_root(app, company_id)?;
    if workspace_dir.exists() {
        fs::remove_dir_all(workspace_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppState;

    #[test]
    fn debounce_forces_commit_after_company_change() {
        reset_commit_debounce("company-a");
        let mut guard = PENDING_COMMIT.lock().expect("lock debounce state");
        let entry = guard.as_mut().expect("debounce initialized");
        entry.last_committed_tick = 500;
        entry.last_committed_day = 12;
        drop(guard);

        let mut state = AppState::default();
        state.company_id = "company-b".to_string();
        state.tick = 3;
        state.day_number = 1;

        let force = {
            let mut guard = PENDING_COMMIT.lock().expect("lock debounce state");
            let entry = guard.as_mut().expect("debounce initialized");
            let company_changed = entry.company_id != state.company_id;
            let tick_delta = if company_changed {
                COMMIT_DEBOUNCE_TICKS
            } else {
                state.tick.saturating_sub(entry.last_committed_tick)
            };
            company_changed || state.day_number != entry.last_committed_day
                || tick_delta >= COMMIT_DEBOUNCE_TICKS
        };

        assert!(force, "switching companies must not suppress the next commit");
    }

    #[test]
    fn app_state_round_trips_through_json_snapshot() {
        let mut state = AppState::default();
        state.seed_defaults();
        state.company_id = "company-test".to_string();
        state.tick = 42;
        state.day_number = 7;

        let json = serde_json::to_string(&state).expect("serialize app state");
        let restored: AppState = serde_json::from_str(&json).expect("deserialize app state");

        assert_eq!(restored.company_id, "company-test");
        assert_eq!(restored.tick, 42);
        assert_eq!(restored.day_number, 7);
        assert_eq!(restored.agents.len(), 3);
    }
}