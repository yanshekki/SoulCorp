use crate::db::persistence::clear_all_persisted_data;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestModeResult {
    pub message: String,
    pub company_name: Option<String>,
    pub company_id: Option<String>,
}

#[tauri::command]
pub fn clear_all_test_data(
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<TestModeResult, String> {
    clear_all_persisted_data(&app)?;
    *app_state.lock().map_err(|e| e.to_string())? = AppState::default();

    Ok(TestModeResult {
        message: "All local SoulCorp data cleared. Restart onboarding from a blank slate.".into(),
        company_name: None,
        company_id: None,
    })
}

