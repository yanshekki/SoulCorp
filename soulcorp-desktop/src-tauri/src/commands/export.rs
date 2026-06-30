use crate::db::persistence::commit;
use crate::report::{
    build_html, build_markdown, build_pdf_lines, company_name_for, slugify, workspace_index,
};
use crate::state::AppState;
use crate::workspace::{storage::workspace_root, WorkspaceStorage};
use chrono::Utc;
use printpdf::{BuiltinFont, Mm, PdfDocument};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub path: String,
    pub format: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanyBackup {
    pub exported_at: String,
    pub company_name: String,
    #[serde(default = "crate::state::default_onboarding_completed")]
    pub onboarding_completed: bool,
    pub day_number: u32,
    #[serde(default)]
    pub tick: u64,
    pub finance: crate::state::FinanceState,
    pub settings: crate::state::GameSettings,
    pub agents: Vec<crate::state::AgentRecord>,
    pub stats: crate::state::GameStats,
    pub achievements: Vec<crate::achievements::Achievement>,
    pub endings: Vec<crate::achievements::Ending>,
    #[serde(default)]
    pub projects: Vec<crate::state::InternalProject>,
}

pub fn build_company_backup(state: &AppState) -> CompanyBackup {
    let company_name = company_name_for(state);

    CompanyBackup {
        exported_at: Utc::now().to_rfc3339(),
        company_name,
        onboarding_completed: state.onboarding_completed,
        day_number: state.day_number,
        tick: state.tick,
        finance: state.finance.clone(),
        settings: state.settings.clone(),
        agents: state.agents.values().cloned().collect(),
        stats: state.stats.clone(),
        achievements: state.achievements.clone(),
        endings: state.endings.clone(),
        projects: state.projects.clone(),
    }
}

pub fn write_auto_backup(app: &AppHandle, state: &AppState) -> Result<String, String> {
    let exports_dir = exports_dir(app)?;
    fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;
    let path = exports_dir.join("soulcorp-auto-backup.json");
    let backup = build_company_backup(state);
    let json = serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn export_company_backup(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<ExportResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    let exports_dir = exports_dir(&app)?;
    fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;

    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let path = exports_dir.join(format!("soulcorp-backup-{timestamp}.json"));

    let backup = build_company_backup(&state);

    let json = serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    state.stats.exports_created += 1;

    let result = ExportResult {
        path: path.to_string_lossy().to_string(),
        format: "json".to_string(),
        message: "Company backup exported.".to_string(),
    };
    commit(app, &state)?;
    Ok(result)
}

fn workspace_tree_for(app: &AppHandle) -> Result<crate::workspace::WorkspaceTree, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = WorkspaceStorage::new(workspace_root(&app_data))?;
    storage.ensure_seed()?;
    storage.list_tree()
}

fn write_company_report_pdf(path: &PathBuf, lines: &[String]) -> Result<(), String> {
    let (doc, page1, layer1) = PdfDocument::new("SoulCorp Report", Mm(210.0), Mm(297.0), "Layer 1");
    let font = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| e.to_string())?;
    let current_layer = doc.get_page(page1).get_layer(layer1);

    let mut y = 285.0;
    for line in lines {
        if y < 18.0 {
            break;
        }
        let size = if line.starts_with("EXECUTIVE") || line.starts_with("PROFIT") || line.starts_with("AGENT") || line.starts_with("PROJECTS") {
            12.0
        } else if line == "SoulCorp Company Report" {
            16.0
        } else {
            10.0
        };
        current_layer.use_text(line, size, Mm(14.0), Mm(y), &font);
        y -= if line.is_empty() { 4.0 } else { 6.0 };
    }

    let file = File::create(path).map_err(|e| e.to_string())?;
    let mut writer = BufWriter::new(file);
    doc.save(&mut writer).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn export_company_report_markdown(
    app: AppHandle,
    app_state: State<'_, Mutex<AppState>>,
) -> Result<ExportResult, String> {
    let path = {
        let locked = app_state.lock().map_err(|e| e.to_string())?;
        let tree = workspace_tree_for(&app)?;
        let company_name = company_name_for(&locked);
        let markdown = build_markdown(&locked, Some(&tree), &company_name);
        let exports_dir = exports_dir(&app)?;
        fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;
        let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
        let path = exports_dir.join(format!("soulcorp-report-{timestamp}.md"));
        fs::write(&path, markdown).map_err(|e| e.to_string())?;
        path
    };

    let mut locked = app_state.lock().map_err(|e| e.to_string())?;
    locked.stats.exports_created += 1;
    let result = ExportResult {
        path: path.to_string_lossy().to_string(),
        format: "markdown".to_string(),
        message: "Company report exported as Markdown.".to_string(),
    };
    commit(app, &locked)?;
    Ok(result)
}

#[tauri::command]
pub fn export_company_report_html(
    app: AppHandle,
    app_state: State<'_, Mutex<AppState>>,
) -> Result<ExportResult, String> {
    let path = {
        let locked = app_state.lock().map_err(|e| e.to_string())?;
        let tree = workspace_tree_for(&app)?;
        let company_name = company_name_for(&locked);
        let html = build_html(&locked, Some(&tree), &company_name);
        let exports_dir = exports_dir(&app)?;
        fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;
        let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
        let path = exports_dir.join(format!("soulcorp-report-{timestamp}.html"));
        fs::write(&path, html).map_err(|e| e.to_string())?;
        path
    };

    let mut locked = app_state.lock().map_err(|e| e.to_string())?;
    locked.stats.exports_created += 1;
    let result = ExportResult {
        path: path.to_string_lossy().to_string(),
        format: "html".to_string(),
        message: "Company report exported as HTML (print to PDF from browser).".to_string(),
    };
    commit(app, &locked)?;
    Ok(result)
}

#[tauri::command]
pub fn export_company_report_pdf(
    app: AppHandle,
    app_state: State<'_, Mutex<AppState>>,
) -> Result<ExportResult, String> {
    let path = {
        let locked = app_state.lock().map_err(|e| e.to_string())?;
        let tree = workspace_tree_for(&app)?;
        let company_name = company_name_for(&locked);
        let lines = build_pdf_lines(&locked, Some(&tree), &company_name);
        let exports_dir = exports_dir(&app)?;
        fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;
        let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
        let path = exports_dir.join(format!("soulcorp-report-{timestamp}.pdf"));
        write_company_report_pdf(&path, &lines)?;
        path
    };

    let mut locked = app_state.lock().map_err(|e| e.to_string())?;
    locked.stats.exports_created += 1;
    let result = ExportResult {
        path: path.to_string_lossy().to_string(),
        format: "pdf".to_string(),
        message: "Company report exported as PDF.".to_string(),
    };
    commit(app, &locked)?;
    Ok(result)
}

#[tauri::command]
pub fn open_exports_folder(app: AppHandle) -> Result<ExportResult, String> {
    let exports_dir = exports_dir(&app)?;
    fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(exports_dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(ExportResult {
        path: exports_dir.to_string_lossy().to_string(),
        format: "folder".to_string(),
        message: "Opened exports folder.".to_string(),
    })
}

#[tauri::command]
pub fn export_workspace_markdown_zip(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<ExportResult, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = WorkspaceStorage::new(workspace_root(&app_data))?;
    let pages_dir = app_data.join("workspaces/pages");
    let exports_dir = exports_dir(&app)?;
    fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;

    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let zip_path = exports_dir.join(format!("soulcorp-workspace-{timestamp}.zip"));
    let file = File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default();

    let tree = storage.list_tree()?;
    let folder_names: std::collections::HashMap<String, String> = tree
        .folders
        .iter()
        .map(|folder| (folder.id.clone(), slugify(&folder.name)))
        .collect();

    if pages_dir.exists() {
        for page in tree.pages.iter() {
            let md_path = pages_dir.join(format!("{}.md", page.id));
            if !md_path.exists() {
                continue;
            }
            let folder_slug = folder_names
                .get(&page.folder_id)
                .cloned()
                .unwrap_or_else(|| "uncategorized".to_string());
            let page_slug = slugify(&page.title);
            let archive_path = format!("workspace/{folder_slug}/{page_slug}.md");
            let content = fs::read_to_string(&md_path).map_err(|e| e.to_string())?;
            zip.start_file(archive_path, options)
                .map_err(|e| e.to_string())?;
            zip.write_all(content.as_bytes())
                .map_err(|e| e.to_string())?;
        }
    }

    let index = workspace_index(&tree);
    zip.start_file("INDEX.md", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(index.as_bytes()).map_err(|e| e.to_string())?;

    let manifest = serde_json::to_string_pretty(&tree).map_err(|e| e.to_string())?;
    zip.start_file("manifest.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(manifest.as_bytes())
        .map_err(|e| e.to_string())?;

    zip.finish().map_err(|e| e.to_string())?;

    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.stats.exports_created += 1;

    let result = ExportResult {
        path: zip_path.to_string_lossy().to_string(),
        format: "zip".to_string(),
        message: "Workspace export created with folder-organized Markdown.".to_string(),
    };
    commit(app, &state)?;
    Ok(result)
}

#[tauri::command]
pub fn import_company_backup(
    path: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<ExportResult, String> {
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let backup: CompanyBackup = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let mut state = state.lock().map_err(|e| e.to_string())?;
    if !backup.company_name.trim().is_empty() {
        state.company_name = backup.company_name.trim().to_string();
    }
    state.onboarding_completed = backup.onboarding_completed;
    state.day_number = backup.day_number;
    state.tick = backup.tick;
    state.finance = backup.finance;
    state.settings = backup.settings;
    state.stats = backup.stats;
    state.achievements = backup.achievements;
    state.endings = backup.endings;
    state.projects = backup.projects;
    state.agents = backup
        .agents
        .into_iter()
        .map(|agent| (agent.id.clone(), agent))
        .collect();

    let result = ExportResult {
        path,
        format: "json".to_string(),
        message: format!(
            "Restored company backup from {} with {} agents.",
            backup.exported_at,
            state.agents.len()
        ),
    };
    commit(app, &state)?;
    Ok(result)
}

fn exports_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("exports"))
}
