use crate::state::AppState;
use crate::workspace::{
    storage::workspace_root, CreatePageRequest, SearchResult, UpdatePageRequest, WorkspacePage,
    WorkspaceStorage, WorkspaceTree,
};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

fn storage_for_app(app: &AppHandle) -> Result<WorkspaceStorage, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = WorkspaceStorage::new(workspace_root(&dir))?;
    storage.ensure_seed()?;
    Ok(storage)
}

#[tauri::command]
pub fn init_workspace(app: AppHandle) -> Result<WorkspaceTree, String> {
    let storage = storage_for_app(&app)?;
    storage.list_tree()
}

#[tauri::command]
pub fn list_workspace_tree(app: AppHandle) -> Result<WorkspaceTree, String> {
    let storage = storage_for_app(&app)?;
    storage.list_tree()
}

#[tauri::command]
pub fn get_workspace_page(app: AppHandle, page_id: String) -> Result<WorkspacePage, String> {
    let storage = storage_for_app(&app)?;
    storage.get_page(&page_id)
}

#[tauri::command]
pub fn create_workspace_page(
    app: AppHandle,
    request: CreatePageRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspacePage, String> {
    let storage = storage_for_app(&app)?;
    let page = storage.create_page(&request, "player")?;
    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.stats.pages_created += 1;
    Ok(page)
}

#[tauri::command]
pub fn update_workspace_page(
    app: AppHandle,
    request: UpdatePageRequest,
) -> Result<WorkspacePage, String> {
    let storage = storage_for_app(&app)?;
    storage.update_page(&request)
}

#[tauri::command]
pub fn search_workspace(app: AppHandle, query: String) -> Result<Vec<SearchResult>, String> {
    let storage = storage_for_app(&app)?;
    storage.search(&query)
}

#[tauri::command]
pub fn generate_meeting_notes(
    app: AppHandle,
    meeting_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<WorkspacePage>, String> {
    let (meeting_type, messages, participant_names) = {
        let state = state.lock().map_err(|e| e.to_string())?;
        let meeting = state
            .meetings
            .get(&meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?;

        let messages: Vec<(String, String)> = meeting
            .messages
            .iter()
            .map(|message| (message.speaker_name.clone(), message.content.clone()))
            .collect();

        let participant_names: Vec<String> = meeting
            .participant_ids
            .iter()
            .filter_map(|id| state.agents.get(id).map(|agent| agent.name.clone()))
            .collect();

        (meeting.meeting_type.clone(), messages, participant_names)
    };

    let storage = storage_for_app(&app)?;
    let pages = storage.append_meeting_notes(&meeting_type, &messages, &participant_names)?;

    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.stats.pages_created += pages.len() as u32;
    Ok(pages)
}
