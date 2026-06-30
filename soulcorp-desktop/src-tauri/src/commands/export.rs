use crate::state::AppState;
use crate::workspace::{storage::workspace_root, WorkspaceStorage};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
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
    pub day_number: u32,
    pub finance: crate::state::FinanceState,
    pub settings: crate::state::GameSettings,
    pub agents: Vec<crate::state::AgentRecord>,
    pub stats: crate::state::GameStats,
    pub achievements: Vec<crate::achievements::Achievement>,
    pub endings: Vec<crate::achievements::Ending>,
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

    let backup = CompanyBackup {
        exported_at: Utc::now().to_rfc3339(),
        company_name: "SoulCorp".to_string(),
        day_number: state.day_number,
        finance: state.finance.clone(),
        settings: state.settings.clone(),
        agents: state.agents.values().cloned().collect(),
        stats: state.stats.clone(),
        achievements: state.achievements.clone(),
        endings: state.endings.clone(),
    };

    let json = serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    state.stats.exports_created += 1;

    Ok(ExportResult {
        path: path.to_string_lossy().to_string(),
        format: "json".to_string(),
        message: "Company backup exported.".to_string(),
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

    if pages_dir.exists() {
        for entry in fs::read_dir(&pages_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("md") {
                let name = path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("page.md");
                let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
                zip.start_file(name, options).map_err(|e| e.to_string())?;
                zip.write_all(content.as_bytes())
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    let tree = storage.list_tree()?;
    let manifest = serde_json::to_string_pretty(&tree).map_err(|e| e.to_string())?;
    zip.start_file("manifest.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(manifest.as_bytes())
        .map_err(|e| e.to_string())?;

    zip.finish().map_err(|e| e.to_string())?;

    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.stats.exports_created += 1;

    Ok(ExportResult {
        path: zip_path.to_string_lossy().to_string(),
        format: "zip".to_string(),
        message: "Workspace markdown export created.".to_string(),
    })
}

fn exports_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("exports"))
}
