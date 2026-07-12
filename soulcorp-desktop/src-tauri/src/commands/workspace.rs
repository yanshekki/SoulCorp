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
use crate::workspace::cache::{get_cached_page, invalidate_cached_page, open_cached_storage, put_cached_page};
use crate::workspace::LinkedEntity;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::lock_util::MutexExt;
struct WorkspaceCtx {
    company_id: String,
    app_data_dir: PathBuf,
    sync_structure: bool,
    departments: Vec<String>,
    agents: Vec<(String, String, String)>,
}

impl WorkspaceCtx {
    fn from_state(app: &AppHandle, state: &AppState, sync_structure: bool) -> Result<Self, String> {
        if state.company_id.is_empty() {
            return Err("Create a company before using the workspace.".to_string());
        }
        Ok(Self {
            company_id: state.company_id.clone(),
            sync_structure,
            departments: collect_departments(state),
            agents: state
                .agents
                .values()
                .map(|agent| {
                    (
                        agent.id.clone(),
                        agent.name.clone(),
                        agent.department.clone(),
                    )
                })
                .collect(),
            app_data_dir: app.path().app_data_dir().map_err(|e| e.to_string())?,
        })
    }

    fn open_storage(&self) -> Result<WorkspaceStorage, String> {
        let storage = open_cached_storage(&self.app_data_dir, &self.company_id)?;
        storage.ensure_seed()?;
        if self.sync_structure {
            storage.ensure_organization_structure(&self.departments, &self.agents)?;
        }
        Ok(storage)
    }
}

async fn run_workspace_read<F, T>(ctx: WorkspaceCtx, work: F) -> Result<T, String>
where
    F: FnOnce(WorkspaceStorage) -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(move || work(ctx.open_storage()?))
        .await
        .map_err(|e| e.to_string())?
}

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
    let locked = state.lock_or_recover()?;
    storage_for_app(app, &locked, false)
}

fn storage_for_app_handle_sync(
    app: &AppHandle,
    state: &State<'_, Mutex<AppState>>,
) -> Result<WorkspaceStorage, String> {
    let locked = state.lock_or_recover()?;
    storage_for_app(app, &locked, true)
}

#[tauri::command]
pub async fn sync_workspace_organization_cmd(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceSnapshot, String> {
    let ctx = {
        let locked = state.lock_or_recover()?;
        WorkspaceCtx::from_state(&app, &locked, true)?
    };
    run_workspace_read(ctx, |storage| storage.list_snapshot()).await
}

#[tauri::command]
pub async fn init_workspace(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceSnapshot, String> {
    let progress = ProgressReporter::new(app.clone(), "workspace_init");
    progress.emit_percent("Syncing workspace folders…", 40.0, Some("folders"));
    let ctx = {
        let locked = state.lock_or_recover()?;
        WorkspaceCtx::from_state(&app, &locked, true)?
    };
    progress.emit_percent("Building workspace index…", 80.0, Some("index"));
    let snapshot = run_workspace_read(ctx, |storage| storage.list_snapshot()).await?;
    progress.finish("Workspace ready");
    progress.clear();
    Ok(snapshot)
}

#[tauri::command]
pub async fn list_workspace_snapshot(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceSnapshot, String> {
    let ctx = {
        let locked = state.lock_or_recover()?;
        WorkspaceCtx::from_state(&app, &locked, false)?
    };
    run_workspace_read(ctx, |storage| storage.list_snapshot()).await
}

#[tauri::command]
pub async fn list_workspace_summaries(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceSummaries, String> {
    let ctx = {
        let locked = state.lock_or_recover()?;
        WorkspaceCtx::from_state(&app, &locked, false)?
    };
    run_workspace_read(ctx, |storage| storage.list_summaries()).await
}

#[tauri::command]
pub async fn list_workspace_folder_children(
    app: AppHandle,
    folder_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceFolderChildren, String> {
    let ctx = {
        let locked = state.lock_or_recover()?;
        WorkspaceCtx::from_state(&app, &locked, false)?
    };
    run_workspace_read(ctx, move |storage| storage.list_folder_children(&folder_id)).await
}

#[tauri::command]
pub async fn resolve_workspace_items(
    app: AppHandle,
    request: ResolveWorkspaceItemsRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceSummaries, String> {
    let ctx = {
        let locked = state.lock_or_recover()?;
        WorkspaceCtx::from_state(&app, &locked, false)?
    };
    run_workspace_read(ctx, move |storage| storage.resolve_items(&request)).await
}

#[tauri::command]
pub async fn list_workspace_tree(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspaceTree, String> {
    let ctx = {
        let locked = state.lock_or_recover()?;
        WorkspaceCtx::from_state(&app, &locked, false)?
    };
    run_workspace_read(ctx, |storage| storage.list_tree()).await
}

#[tauri::command]
pub async fn get_workspace_page(
    app: AppHandle,
    page_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspacePage, String> {
    use crate::app_log::{LogCategory, LogErr};
    let result = async {
        let company_id = {
            let locked = state.lock_or_recover()?;
            if locked.company_id.is_empty() {
                return Err("Create a company before using the workspace.".to_string());
            }
            locked.company_id.clone()
        };
        if let Some(page) = get_cached_page(&company_id, &page_id) {
            return Ok(page);
        }
        let ctx = {
            let locked = state.lock_or_recover()?;
            WorkspaceCtx::from_state(&app, &locked, false)?
        };
        let page = run_workspace_read(ctx, move |storage| storage.get_page(&page_id)).await?;
        put_cached_page(&company_id, &page);
        Ok(page)
    }
    .await;
    result.log_err(&app, LogCategory::Workspace, "get_workspace_page")
}

#[tauri::command]
pub fn create_workspace_page(
    app: AppHandle,
    request: CreatePageRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<WorkspacePage, String> {
    let storage = storage_for_app_handle_sync(&app, &state)?;
    let page = storage.create_page(&request, "player")?;
    let mut state = state.lock_or_recover()?;
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
    let company_id = {
        let locked = state.lock_or_recover()?;
        locked.company_id.clone()
    };
    let storage = storage_for_app_handle(&app, &state)?;
    let page = storage.update_page(&request)?;
    if !company_id.is_empty() {
        invalidate_cached_page(&company_id, &request.page_id);
        put_cached_page(&company_id, &page);
    }
    Ok(page)
}

/// LLM-translate a single workspace page into `target_language` (or company app language).
/// Runs off the async runtime; never holds AppState during the LLM HTTP call.
#[tauri::command]
pub async fn translate_workspace_page_cmd(
    app: AppHandle,
    page_id: String,
    target_language: Option<String>,
) -> Result<WorkspacePage, String> {
    let app2 = app.clone();
    let page_id2 = page_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state_mutex = app2.state::<Mutex<AppState>>();
        let storage = {
            let locked = state_mutex.lock_or_recover()?;
            if locked.company_id.is_empty() {
                return Err("Create a company before using the workspace.".to_string());
            }
            let dir = app2.path().app_data_dir().map_err(|e| e.to_string())?;
            WorkspaceStorage::new(company_workspace_root(&dir, &locked.company_id))?
        };

        let (runtime, target, company_id) = {
            let locked = state_mutex.lock_or_recover()?;
            let target = target_language
                .as_deref()
                .map(crate::i18n::parse_language)
                .unwrap_or_else(|| crate::i18n::language_from_settings(&locked.settings));
            let runtime = crate::i18n::snapshot_translate_runtime(&locked);
            if !locked.settings.pure_local_mode {
                crate::token_budget::can_afford(&locked, &runtime.agent_id, 2_000)?;
            }
            (runtime, target, locked.company_id.clone())
        };
        let (page, charges) = crate::i18n::translate_workspace_page_detached(
            &storage, &runtime, &page_id2, target,
        )?;
        {
            let mut locked = state_mutex.lock_or_recover()?;
            for charge in charges {
                let _ = crate::token_budget::charge_tokens(&mut locked, charge);
            }
            if !company_id.is_empty() {
                invalidate_cached_page(&company_id, &page_id2);
                put_cached_page(&company_id, &page);
            }
            let _ = commit(app2.clone(), &locked);
        }
        Ok(page)
    })
    .await
    .map_err(|e| format!("Translate task failed: {e}"))?
}

/// LLM-translate free text (notes, SQL-exported prose, pasted content).
#[tauri::command]
pub async fn translate_text_content_cmd(
    app: AppHandle,
    text: String,
    title: Option<String>,
    target_language: Option<String>,
) -> Result<crate::i18n::TranslatedDocument, String> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state_mutex = app2.state::<Mutex<AppState>>();
        let (runtime, target) = {
            let locked = state_mutex.lock_or_recover()?;
            let target = target_language
                .as_deref()
                .map(crate::i18n::parse_language)
                .unwrap_or_else(|| crate::i18n::language_from_settings(&locked.settings));
            let runtime = crate::i18n::snapshot_translate_runtime(&locked);
            if !locked.settings.pure_local_mode {
                crate::token_budget::can_afford(&locked, &runtime.agent_id, 2_000)?;
            }
            (runtime, target)
        };
        let (doc, charges) = crate::i18n::translate_document_with_runtime(
            &runtime,
            title.as_deref().unwrap_or(""),
            &text,
            target,
        )?;
        {
            let mut locked = state_mutex.lock_or_recover()?;
            for charge in charges {
                let _ = crate::token_budget::charge_tokens(&mut locked, charge);
            }
        }
        Ok(doc)
    })
    .await
    .map_err(|e| format!("Translate task failed: {e}"))?
}

/// Translate multiple workspace page IDs (max 20 per call).
#[tauri::command]
pub async fn translate_workspace_pages_batch_cmd(
    app: AppHandle,
    page_ids: Vec<String>,
    target_language: Option<String>,
) -> Result<Vec<WorkspacePage>, String> {
    if page_ids.is_empty() {
        return Err("No page ids provided.".to_string());
    }
    let mut results = Vec::new();
    for page_id in page_ids.into_iter().take(20) {
        match translate_workspace_page_cmd(app.clone(), page_id, target_language.clone()).await {
            Ok(page) => results.push(page),
            Err(err) => {
                crate::app_log::log_global(
                    crate::app_log::LogLevel::Warn,
                    crate::app_log::LogCategory::Ai,
                    "content_translate",
                    format!("Batch page failed: {err}"),
                    None,
                );
            }
        }
    }
    if results.is_empty() {
        return Err("No pages could be translated.".to_string());
    }
    Ok(results)
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
    let state = state.lock_or_recover()?;
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
    let mut state = state.lock_or_recover()?;
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
    let state = state.lock_or_recover()?;

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
    let mut state = state.lock_or_recover()?;
    let pages = write_meeting_notes_from_state(&app, &mut state, &meeting_id, None)?;
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
