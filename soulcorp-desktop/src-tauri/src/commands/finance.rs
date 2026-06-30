use crate::state::{AppState, FinanceState};
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub fn get_finance_state(state: State<'_, Mutex<AppState>>) -> Result<FinanceState, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.finance.clone())
}
