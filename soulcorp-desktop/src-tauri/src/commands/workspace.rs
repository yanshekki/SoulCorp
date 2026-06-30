use crate::db::persistence::commit;
use crate::state::AppState;
use crate::workspace::{
    storage::workspace_root, write_meeting_notes_from_state, CreatePageRequest, LinkableEntity,
    LinkEntityRequest, PageBacklink, SearchResult, UnlinkEntityRequest, UpdatePageRequest,
    WorkspacePage, WorkspaceStorage, WorkspaceTree,
};
use crate::workspace::LinkedEntity;
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
    commit(app.clone(), &state)?;
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
pub fn list_linkable_entities(
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<LinkableEntity>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let mut entities = Vec::new();

    for agent in state.agents.values() {
        entities.push(LinkableEntity {
            entity_type: "agent".to_string(),
            id: agent.id.clone(),
            title: agent.name.clone(),
            subtitle: Some(format!("{} · {}", agent.role, agent.department)),
        });
    }

    for project in &state.projects {
        entities.push(LinkableEntity {
            entity_type: "project".to_string(),
            id: project.id.clone(),
            title: project.title.clone(),
            subtitle: Some(format!(
                "{:.0}% · {}",
                project.progress * 100.0,
                project.owner_department
            )),
        });
    }

    for meeting in state.meetings.values() {
        entities.push(LinkableEntity {
            entity_type: "meeting".to_string(),
            id: meeting.id.clone(),
            title: format!("{} meeting", meeting.meeting_type),
            subtitle: Some(if meeting.completed {
                "completed".to_string()
            } else {
                "in progress".to_string()
            }),
        });
    }

    for event in state.events.iter().rev().take(6) {
        entities.push(LinkableEntity {
            entity_type: "event".to_string(),
            id: event.id.clone(),
            title: event.title.clone(),
            subtitle: Some(event.tone.clone()),
        });
    }

    Ok(entities)
}

#[tauri::command]
pub fn link_workspace_entity(
    app: AppHandle,
    request: LinkEntityRequest,
) -> Result<WorkspacePage, String> {
    let storage = storage_for_app(&app)?;
    storage.link_entity_to_page(
        &request.page_id,
        LinkedEntity {
            entity_type: request.entity_type,
            id: request.entity_id,
            title: request.title,
        },
        "player",
    )
}

#[tauri::command]
pub fn unlink_workspace_entity(
    app: AppHandle,
    request: UnlinkEntityRequest,
) -> Result<WorkspacePage, String> {
    let storage = storage_for_app(&app)?;
    storage.unlink_entity_from_page(
        &request.page_id,
        &request.entity_type,
        &request.entity_id,
        "player",
    )
}

#[tauri::command]
pub fn find_workspace_backlinks(
    app: AppHandle,
    entity_type: String,
    entity_id: String,
) -> Result<Vec<PageBacklink>, String> {
    let storage = storage_for_app(&app)?;
    storage.find_backlinks(&entity_type, &entity_id)
}

#[tauri::command]
pub fn generate_meeting_notes(
    app: AppHandle,
    meeting_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<WorkspacePage>, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    let pages = write_meeting_notes_from_state(&app, &mut state, &meeting_id)?;
    commit(app, &state)?;
    Ok(pages)
}
