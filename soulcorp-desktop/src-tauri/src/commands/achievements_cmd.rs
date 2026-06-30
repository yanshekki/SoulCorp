use crate::achievements::{evaluate, AchievementSnapshot};
use crate::state::AppState;
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub fn get_achievements(state: State<'_, Mutex<AppState>>) -> Result<AchievementSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    Ok(evaluate(&mut state))
}
