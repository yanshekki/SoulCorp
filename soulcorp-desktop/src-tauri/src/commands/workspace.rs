use crate::db::persistence::commit;
use crate::progress::ProgressReporter;
use crate::state::AppState;
use crate::workspace::{
    create_page_from_template, list_templates, storage::company_workspace_root,
    write_meeting_notes_from_state, AddPageCommentRequest, CreateFolderRequest,
    CreatePageFromTemplateRequest, CreatePageRequest, DeleteFolderRequest, DeletePageRequest,
    DeleteWorkspaceFileRequest, ImportWorkspaceFilesRequest, LinkableEntity, LinkEntityRequest,
    PageBacklink, PageComment, PageVersionSummary, ReorderWorkspaceItemsRequest,
    ReorderWorkspacePagesRequest, RestorePageVersionRequest, SearchResult, UnlinkEntityRequest,
    UpdatePageRequest, WorkspaceDatabaseView, WorkspaceFile, WorkspaceFilePathResponse,
    WorkspaceFileSummary, WorkspaceFolder, WorkspacePage, WorkspacePresenceEntry,
    WorkspaceSnapshot, WorkspaceStorage, WorkspaceSummaries, WorkspaceTemplate,
    WorkspaceTree, WorkspaceFolderChildren, ResolveWorkspaceItemsRequest,
};
use crate::workspace::LinkedEntity;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

fn collect_departments(state: &AppState) -> Vec<String> {
    crate::departments::department_names(state)
}

fn storage_for_app(
    app: &AppHandle,
    state: &AppState,
    sync_structure: bool,
) -> Result<WorkspaceStorage, String> {
    if state.company_id.is_empty() {
        return Err("Create a company before using the workspace.".to_string());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = WorkspaceStorage::new(company_workspace_root(&dir, &state.company_id))?;
    storage.ensure_seed()?;
    if sync_structure {
        let agents: Vec<(String, String, String)> = state
            .agents
            .values()
            .map(|agent| (agent.id.clone(), agent.name.clone(), agent.department.clone()))
            .collect();
        storage.ensure_organization_structure(&collect_departments(state), &agents)?;
    }
    Ok(storage)
}

fn storage_for_app_handle(app: &AppHandle, state: &State<'_, Mutex<AppState>>) -> Result<WorkspaceStorage, String> {
    let locked = state.lock().map_err(|e| e.to_string())?;
    storage_for_app(app, &locked, false)
}

fn storage_for_app_handle_sync(
    app: &AppHandle,
    state: &State<'_, Mutex<AppState>>,
) -> Result<WorkspaceStorage, String> {
    let locked = state.lock().map_err(|e| e.to_string())?;
    storage_for_app(app, &locked, true)
}

#[tauri::command]
pub fn init_workspace(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceSnapshot, String> {
    let progress = ProgressReporter::new(app.clone(), "workspace_init");
    progress.emit_percent("Syncing workspace folders…", 40.0, Some("folders"));
    let storage = storage_for_app_handle_sync(&app, &state)?;
    progress.emit_percent("Building workspace index…", 80.0, Some("index"));
    let snapshot = storage.list_snapshot()?;
    progress.finish("Workspace ready");
    progress.clear();
    Ok(snapshot)
}

#[tauri::command]
pub fn list_workspace_snapshot(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceSnapshot, String> {
    let storage = storage_for_app_handle_sync(&app, &state)?;
    storage.list_snapshot()
}

#[tauri::command]
pub fn list_workspace_summaries(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceSummaries, String> {
    let storage = storage_for_app_handle_sync(&app, &state)?;
    storage.list_summaries()
}

#[tauri::command]
pub fn list_workspace_folder_children(
    app: AppHandle,
    folder_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceFolderChildren, String> {
    let storage = storage_for_app_handle_sync(&app, &state)?;
    storage.list_folder_children(&folder_id)
}

#[tauri::command]
pub fn resolve_workspace_items(
    app: AppHandle,
    request: ResolveWorkspaceItemsRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceSummaries, String> {
    let storage = storage_for_app_handle_sync(&app, &state)?;
    storage.resolve_items(&request)
}

#[tauri::command]
pub fn list_workspace_tree(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceTree, String> {
    let storage = storage_for_app_handle_sync(&app, &state)?;
    storage.list_tree()
}

#[tauri::command]
pub fn get_workspace_page(
    app: AppHandle,
    page_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspacePage, String> {
    let storage = storage_for_app_handle(&app, &state)?;
    storage.get_page(&page_id)
}

#[tauri::command]
pub fn create_workspace_page(
    app: AppHandle,
    request: CreatePageRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspacePage, String> {
    let storage = storage_for_app_handle_sync(&app, &state)?;
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
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspacePage, String> {
    let storage = storage_for_app_handle(&app, &state)?;
    storage.update_page(&request)
}

#[tauri::command]
pub fn search_workspace(
    app: AppHandle,
    query: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<SearchResult>, String> {
    let storage = storage_for_app_handle(&app, &state)?;
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
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspacePage, String> {
    let storage = storage_for_app_handle(&app, &state)?;
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
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspacePage, String> {
    let storage = storage_for_app_handle(&app, &state)?;
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
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<PageBacklink>, String> {
    let storage = storage_for_app_handle(&app, &state)?;
    storage.find_backlinks(&entity_type, &entity_id)
}

#[tauri::command]
pub fn list_workspace_templates() -> Result<Vec<WorkspaceTemplate>, String> {
    Ok(list_templates())
}

#[tauri::command]
pub fn create_page_from_template_cmd(
    app: AppHandle,
    request: CreatePageFromTemplateRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspacePage, String> {
    let storage = storage_for_app_handle_sync(&app, &state)?;
    let page = create_page_from_template(
        &storage,
        &request.template_id,
        &request.folder_id,
        request.title.as_deref(),
        "player",
    )?;
    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.stats.pages_created += 1;
    commit(app, &state)?;
    Ok(page)
}

#[tauri::command]
pub fn list_page_versions(
    app: AppHandle,
    page_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<PageVersionSummary>, String> {
    let storage = storage_for_app_handle(&app, &state)?;
    storage.list_page_versions(&page_id)
}

#[tauri::command]
pub fn restore_page_version(
    app: AppHandle,
    request: RestorePageVersionRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspacePage, String> {
    let storage = storage_for_app_handle(&app, &state)?;
    storage.restore_page_version(&request.page_id, request.version, "player")
}

#[tauri::command]
pub fn list_page_comments(
    app: AppHandle,
    page_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<PageComment>, String> {
    let storage = storage_for_app_handle(&app, &state)?;
    storage.list_page_comments(&page_id)
}

#[tauri::command]
pub fn add_page_comment(
    app: AppHandle,
    request: AddPageCommentRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<PageComment, String> {
    let storage = storage_for_app_handle(&app, &state)?;
    storage.add_page_comment(&request)
}

#[tauri::command]
pub fn set_workspace_presence(
    app: AppHandle,
    page_id: String,
    editor: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let storage = storage_for_app_handle(&app, &state)?;
    storage.set_workspace_presence(&page_id, &editor)
}

#[tauri::command]
pub fn get_workspace_presence(
    app: AppHandle,
    page_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<WorkspacePresenceEntry>, String> {
    let storage = storage_for_app_handle(&app, &state)?;
    storage.get_workspace_presence(&page_id)
}

#[tauri::command]
pub fn clear_workspace_presence(
    app: AppHandle,
    editor: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let storage = storage_for_app_handle(&app, &state)?;
    storage.clear_workspace_presence(&editor)
}

#[tauri::command]
pub fn get_workspace_database(
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<WorkspaceDatabaseView>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;

    let project_rows: Vec<Vec<String>> = state
        .projects
        .iter()
        .map(|project| {
            vec![
                project.title.clone(),
                project.owner_department.clone(),
                format!("{:.0}%", project.progress * 100.0),
                project.priority.to_string(),
            ]
        })
        .collect();

    let deliverable_rows: Vec<Vec<String>> = state
        .gig_contracts
        .iter()
        .filter(|contract| contract.qc_score.is_some())
        .map(|contract| {
            vec![
                contract.title.clone(),
                contract.status.clone(),
                contract
                    .qc_score
                    .map(|score| format!("{:.0}%", score * 100.0))
                    .unwrap_or_else(|| "—".to_string()),
                format!("${:.0}", contract.budget_usdt),
            ]
        })
        .collect();

    Ok(vec![
        WorkspaceDatabaseView {
            id: "projects".to_string(),
            title: "Project Tracker".to_string(),
            description: "Internal projects linked to departments and progress.".to_string(),
            columns: vec![
                "Project".to_string(),
                "Department".to_string(),
                "Progress".to_string(),
                "Priority".to_string(),
            ],
            rows: project_rows,
        },
        WorkspaceDatabaseView {
            id: "deliverables".to_string(),
            title: "Deliverable Log".to_string(),
            description: "QC-rated marketplace deliverables ready for export.".to_string(),
            columns: vec![
                "Gig".to_string(),
                "Status".to_string(),
                "QC Score".to_string(),
                "Budget".to_string(),
            ],
            rows: deliverable_rows,
        },
    ])
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

#[tauri::command]
pub fn create_workspace_folder(
    app: AppHandle,
    request: CreateFolderRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceFolder, String> {
    let storage = storage_for_app_handle_sync(&app, &state)?;
    storage.create_folder(&request)
}

#[tauri::command]
pub fn delete_workspace_page(
    app: AppHandle,
    request: DeletePageRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let storage = storage_for_app_handle_sync(&app, &state)?;
    storage.delete_page(&request)
}

#[tauri::command]
pub fn delete_workspace_folder(
    app: AppHandle,
    request: DeleteFolderRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let storage = storage_for_app_handle_sync(&app, &state)?;
    storage.delete_folder(&request)
}

#[tauri::command]
pub fn reorder_workspace_pages(
    app: AppHandle,
    request: ReorderWorkspacePagesRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceTree, String> {
    let storage = storage_for_app_handle_sync(&app, &state)?;
    storage.reorder_pages(&request)?;
    storage.list_tree()
}

#[tauri::command]
pub fn reorder_workspace_items(
    app: AppHandle,
    request: ReorderWorkspaceItemsRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceTree, String> {
    let storage = storage_for_app_handle_sync(&app, &state)?;
    storage.reorder_items(&request)?;
    storage.list_tree()
}

#[tauri::command]
pub fn import_workspace_files(
    app: AppHandle,
    request: ImportWorkspaceFilesRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<WorkspaceFileSummary>, String> {
    let storage = storage_for_app_handle_sync(&app, &state)?;
    storage.import_files(&request, "player")
}

#[tauri::command]
pub fn get_workspace_file(
    app: AppHandle,
    file_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceFile, String> {
    let storage = storage_for_app_handle(&app, &state)?;
    storage.get_file(&file_id)
}

#[tauri::command]
pub fn get_workspace_file_path(
    app: AppHandle,
    file_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceFilePathResponse, String> {
    let storage = storage_for_app_handle(&app, &state)?;
    storage.get_file_path_response(&file_id)
}

#[tauri::command]
pub fn delete_workspace_file(
    app: AppHandle,
    request: DeleteWorkspaceFileRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let storage = storage_for_app_handle_sync(&app, &state)?;
    storage.delete_file(&request)
}

#[tauri::command]
pub fn open_workspace_file_externally(
    app: AppHandle,
    file_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let storage = storage_for_app_handle(&app, &state)?;
    let response = storage.get_file_path_response(&file_id)?;
    app.opener()
        .open_path(response.absolute_path, None::<&str>)
        .map_err(|e| e.to_string())
}
