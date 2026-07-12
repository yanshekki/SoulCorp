use crate::achievements::{default_achievements, default_endings, evaluate, AchievementSnapshot};
use crate::config;
use crate::db::persistence::commit;
use crate::state::AppState;
use std::sync::Mutex;
use tauri::{AppHandle, State};

use crate::lock_util::MutexExt;
#[tauri::command]
pub fn get_achievements(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AchievementSnapshot, String> {
    let mut state = state.lock_or_recover()?;
    if config::is_v1() {
        return Ok(AchievementSnapshot {
            achievements: default_achievements(),
            endings: default_endings(),
            newly_unlocked: vec![],
        });
    }
    let snapshot = evaluate(&mut state);
    commit(app, &state)?;
    Ok(snapshot)
}
