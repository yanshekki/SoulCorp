use crate::state::AppState;
use crate::workspace::{
    agent_service::AgentContext, company_workspace_root, AgentWorkspaceActivityEntry,
    AgentWorkspaceAppendRequest, AgentWorkspaceContext, AgentWorkspaceCreatePageRequest,
    AgentWorkspaceDeliverableRequest, AgentWorkspaceJournalRequest, AgentWorkspacePageView,
    AgentWorkspaceReadPageRequest, AgentWorkspaceSearchRequest, AgentWorkspaceService,
    WorkspaceFolderChildren, WorkspacePage, SearchResult, WorkspaceStorage,
};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

fn agent_context_from_state(state: &AppState, agent_id: &str) -> Result<AgentContext, String> {
    let agent = state
        .agents
        .get(agent_id)
        .ok_or_else(|| format!("Agent {agent_id} not found."))?;
    Ok(AgentContext::from_record(agent))
}

fn open_storage(app: &AppHandle, state: &State<'_, Mutex<AppState>>) -> Result<WorkspaceStorage, String> {
    let locked = state.lock().map_err(|e| e.to_string())?;
    if locked.company_id.is_empty() {
        return Err("Create a company before using the agent workspace.".to_string());
    }
    let company_id = locked.company_id.clone();
    drop(locked);
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = WorkspaceStorage::new(company_workspace_root(&dir, &company_id))?;
    storage.ensure_seed()?;
    Ok(storage)
}

#[tauri::command]
pub fn agent_workspace_list_folder(
    app: AppHandle,
    agent_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceFolderChildren, String> {
    let storage = open_storage(&app, &state)?;
    let locked = state.lock().map_err(|e| e.to_string())?;
    let agent = agent_context_from_state(&locked, &agent_id)?;
    let service = AgentWorkspaceService::new(&storage);
    service.list_folder(&agent)
}

#[tauri::command]
pub fn agent_workspace_get_context(
    app: AppHandle,
    agent_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<AgentWorkspaceContext, String> {
    let storage = open_storage(&app, &state)?;
    let locked = state.lock().map_err(|e| e.to_string())?;
    let agent = agent_context_from_state(&locked, &agent_id)?;
    let service = AgentWorkspaceService::new(&storage);
    service.get_context(&agent)
}

#[tauri::command]
pub fn agent_workspace_read_page(
    app: AppHandle,
    request: AgentWorkspaceReadPageRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<AgentWorkspacePageView, String> {
    let storage = open_storage(&app, &state)?;
    let locked = state.lock().map_err(|e| e.to_string())?;
    let agent = agent_context_from_state(&locked, &request.agent_id)?;
    let service = AgentWorkspaceService::new(&storage);
    service.read_page(&agent, &request.page_id)
}

#[tauri::command]
pub fn agent_workspace_search(
    app: AppHandle,
    request: AgentWorkspaceSearchRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<SearchResult>, String> {
    let storage = open_storage(&app, &state)?;
    let locked = state.lock().map_err(|e| e.to_string())?;
    let agent = agent_context_from_state(&locked, &request.agent_id)?;
    let service = AgentWorkspaceService::new(&storage);
    let limit = request.limit.unwrap_or(20).clamp(1, 50) as usize;
    service.search(&agent, &request.query, limit)
}

#[tauri::command]
pub fn agent_workspace_create_page(
    app: AppHandle,
    request: AgentWorkspaceCreatePageRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspacePage, String> {
    let storage = open_storage(&app, &state)?;
    let locked = state.lock().map_err(|e| e.to_string())?;
    let agent = agent_context_from_state(&locked, &request.agent_id)?;
    let service = AgentWorkspaceService::new(&storage);
    service.create_page(&agent, &request.title, request.content.as_deref())
}

#[tauri::command]
pub fn agent_workspace_append_page(
    app: AppHandle,
    request: AgentWorkspaceAppendRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspacePage, String> {
    let storage = open_storage(&app, &state)?;
    let locked = state.lock().map_err(|e| e.to_string())?;
    let agent = agent_context_from_state(&locked, &request.agent_id)?;
    let service = AgentWorkspaceService::new(&storage);
    service.append_to_page(&agent, &request.page_id, &request.heading, &request.lines)
}

#[tauri::command]
pub fn agent_workspace_append_journal(
    app: AppHandle,
    request: AgentWorkspaceJournalRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspacePage, String> {
    let storage = open_storage(&app, &state)?;
    let locked = state.lock().map_err(|e| e.to_string())?;
    let agent = agent_context_from_state(&locked, &request.agent_id)?;
    let service = AgentWorkspaceService::new(&storage);
    service.append_journal(
        &agent,
        &request.journal_title,
        &request.heading,
        &request.lines,
    )
}

#[tauri::command]
pub fn agent_workspace_write_deliverable(
    app: AppHandle,
    request: AgentWorkspaceDeliverableRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspacePage, String> {
    let storage = open_storage(&app, &state)?;
    let locked = state.lock().map_err(|e| e.to_string())?;
    let agent = agent_context_from_state(&locked, &request.agent_id)?;
    let service = AgentWorkspaceService::new(&storage);
    service.write_deliverable(&agent, &request.title, &request.content)
}

#[tauri::command]
pub fn agent_workspace_list_activity(
    app: AppHandle,
    limit: Option<u32>,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<AgentWorkspaceActivityEntry>, String> {
    let storage = open_storage(&app, &state)?;
    let locked = state.lock().map_err(|e| e.to_string())?;
    let agents: Vec<AgentContext> = locked
        .agents
        .values()
        .map(AgentContext::from_record)
        .collect();
    let service = AgentWorkspaceService::new(&storage);
    service.list_company_activity(&agents, limit.unwrap_or(30).clamp(1, 100) as usize)
}