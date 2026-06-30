use crate::state::AppState;
use rusqlite::{Connection, OptionalExtension};
use tauri::AppHandle;

use super::database_path;

const SNAPSHOT_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS app_snapshot (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"#;

fn open_connection(app: &AppHandle) -> Result<Connection, String> {
    let path = database_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(SNAPSHOT_SQL)
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

pub fn load_app_state(app: &AppHandle) -> Result<Option<AppState>, String> {
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

pub fn persist_app_state(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let conn = open_connection(app)?;
    let json = serde_json::to_string(state).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO app_snapshot (id, state_json, updated_at)
         VALUES (1, ?1, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           state_json = excluded.state_json,
           updated_at = excluded.updated_at",
        [&json],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn commit(app: AppHandle, state: &AppState) -> Result<(), String> {
    persist_app_state(&app, state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppState;

    #[test]
    fn app_state_round_trips_through_json_snapshot() {
        let mut state = AppState::default();
        state.seed_defaults();
        state.tick = 42;
        state.day_number = 7;

        let json = serde_json::to_string(&state).expect("serialize app state");
        let restored: AppState = serde_json::from_str(&json).expect("deserialize app state");

        assert_eq!(restored.tick, 42);
        assert_eq!(restored.day_number, 7);
        assert_eq!(restored.agents.len(), 3);
    }
}
