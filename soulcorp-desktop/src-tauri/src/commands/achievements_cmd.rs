use crate::achievements::{evaluate, AchievementSnapshot};
use crate::db::persistence::commit;
use crate::state::AppState;
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_achievements(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AchievementSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    let snapshot = evaluate(&mut state);
    commit(app, &state)?;
    Ok(snapshot)
}
