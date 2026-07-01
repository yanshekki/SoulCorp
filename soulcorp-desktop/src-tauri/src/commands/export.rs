use crate::db::persistence::commit;
use crate::progress::ProgressReporter;
use crate::report::{
    build_html, build_markdown, build_pdf_lines, company_name_for, slugify, workspace_index,
};
use crate::state::AppState;
use crate::static_site::{
    build_deliverables_html, build_deploy_readme, build_index_html, build_manifest_json,
    build_netlify_toml, build_report_page_html, build_site_css, build_sitemap_xml,
    build_vercel_json,
    build_workspace_index_html, build_workspace_page_html,
};
use crate::tier::can_use_feature;
use crate::workspace::{storage::company_workspace_root, WorkspaceStorage};
use chrono::Utc;
use printpdf::{BuiltinFont, Mm, PdfDocument};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
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
    #[serde(rename = "token_economy", alias = "finance")]
    pub token_economy: crate::state::TokenEconomy,
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
        token_economy: state.token_economy.clone(),
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

fn workspace_tree_for(app: &AppHandle, state: &AppState) -> Result<crate::workspace::WorkspaceTree, String> {
    if state.company_id.is_empty() {
        return Err("Create a company before exporting workspace data.".to_string());
    }
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = WorkspaceStorage::new(company_workspace_root(&app_data, &state.company_id))?;
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
        let tree = workspace_tree_for(&app, &locked)?;
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
        let tree = workspace_tree_for(&app, &locked)?;
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
        let tree = workspace_tree_for(&app, &locked)?;
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

fn zip_write_text(
    zip: &mut ZipWriter<File>,
    path: &str,
    content: &str,
    options: SimpleFileOptions,
) -> Result<(), String> {
    zip.start_file(path, options)
        .map_err(|e| e.to_string())?;
    zip.write_all(content.as_bytes())
        .map_err(|e| e.to_string())
}

#[derive(Debug, Clone)]
pub struct StaticSiteBundle {
    pub company_name: String,
    pub white_label: bool,
    pub index_html: String,
    pub report_html: String,
    pub deliverables_html: String,
    pub manifest_json: String,
    pub deploy_readme: String,
}

pub fn prepare_static_site_bundle(
    app: &AppHandle,
    state: &AppState,
    archive_name: &str,
) -> Result<(StaticSiteBundle, crate::workspace::WorkspaceTree), String> {
    let tree = workspace_tree_for(app, state)?;
    let company_name = company_name_for(state);
    let white_label = can_use_feature(&state.hub.user_tier, "white_label_export");
    let bundle = StaticSiteBundle {
        company_name: company_name.clone(),
        white_label,
        index_html: build_index_html(state, &tree, &company_name, white_label),
        report_html: build_report_page_html(state, Some(&tree), &company_name, white_label),
        deliverables_html: build_deliverables_html(&state.gig_contracts, &company_name, white_label),
        manifest_json: build_manifest_json(state, &tree, &company_name, archive_name),
        deploy_readme: build_deploy_readme(&company_name),
    };
    Ok((bundle, tree))
}

fn write_dir_text(base: &Path, relative: &str, content: &str) -> Result<(), String> {
    let path = base.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, content).map_err(|e| e.to_string())
}

pub fn write_static_site_to_dir(
    dir: &Path,
    bundle: &StaticSiteBundle,
    tree: &crate::workspace::WorkspaceTree,
    pages_dir: &Path,
) -> Result<(), String> {
    if dir.exists() {
        fs::remove_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;

    write_dir_text(dir, "index.html", &bundle.index_html)?;
    write_dir_text(dir, "report.html", &bundle.report_html)?;
    write_dir_text(dir, "deliverables.html", &bundle.deliverables_html)?;
    write_dir_text(dir, "assets/site.css", build_site_css())?;
    write_dir_text(dir, "DEPLOY.md", &bundle.deploy_readme)?;
    write_dir_text(dir, "netlify.toml", build_netlify_toml())?;
    write_dir_text(dir, "sitemap.xml", build_sitemap_xml())?;
    write_dir_text(dir, "vercel.json", build_vercel_json())?;
    write_dir_text(dir, "manifest.json", &bundle.manifest_json)?;

    let workspace_index_html = build_workspace_index_html(tree, &bundle.company_name);
    write_dir_text(dir, "workspace/index.html", &workspace_index_html)?;

    let folder_names: std::collections::HashMap<String, String> = tree
        .folders
        .iter()
        .map(|folder| (folder.id.clone(), slugify(&folder.name)))
        .collect();
    let folder_titles: std::collections::HashMap<String, String> = tree
        .folders
        .iter()
        .map(|folder| (folder.id.clone(), folder.name.clone()))
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
            let folder_name = folder_titles
                .get(&page.folder_id)
                .cloned()
                .unwrap_or_else(|| "Uncategorized".to_string());
            let page_slug = slugify(&page.title);
            let markdown = fs::read_to_string(&md_path).map_err(|e| e.to_string())?;
            let page_html = build_workspace_page_html(
                &page.title,
                &folder_name,
                &markdown,
                &bundle.company_name,
            );
            let archive_path = format!("workspace/{folder_slug}/{page_slug}.html");
            write_dir_text(dir, &archive_path, &page_html)?;
        }
    }

    Ok(())
}

pub fn exports_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("exports"))
}

pub fn deploy_staging_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("deploy-staging"))
}

#[tauri::command]
pub async fn export_static_site_zip(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<ExportResult, String> {
    let progress = ProgressReporter::new(app.clone(), "export_static_site");
    progress.emit_percent("Preparing static site bundle…", 15.0, Some("prepare"));

    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let exports_dir = exports_dir(&app)?;
    fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;

    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let zip_filename = format!("soulcorp-static-site-{timestamp}.zip");
    let zip_path = exports_dir.join(&zip_filename);

    let (bundle, tree, pages_dir) = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        if locked.company_id.is_empty() {
            return Err("Create a company before exporting a static site.".to_string());
        }
        let pages_dir =
            company_workspace_root(&app_data, &locked.company_id).join("pages");
        let bundle_tree = prepare_static_site_bundle(&app, &locked, &zip_filename)?;
        (bundle_tree.0, bundle_tree.1, pages_dir)
    };

    let white_label = bundle.white_label;
    let app_clone = app.clone();
    let zip_path_clone = zip_path.clone();
    progress.emit_percent("Building static site ZIP…", 45.0, Some("zip"));

    tokio::task::spawn_blocking(move || {
        build_static_site_zip_file(&app_clone, &zip_path_clone, &bundle, &tree, &pages_dir)
    })
    .await
    .map_err(|e| e.to_string())??;

    let mut locked = state.lock().map_err(|e| e.to_string())?;
    locked.stats.exports_created += 1;
    let branding = if white_label {
        "white-label"
    } else {
        "SoulCorp-branded"
    };
    let result = ExportResult {
        path: zip_path.to_string_lossy().to_string(),
        format: "zip".to_string(),
        message: format!(
            "Static site ZIP created ({branding}). Upload to Netlify, Vercel, or GitHub Pages."
        ),
    };
    commit(app, &locked)?;
    progress.finish("Static site export complete");
    progress.clear();
    Ok(result)
}

fn build_static_site_zip_file(
    _app: &AppHandle,
    zip_path: &Path,
    bundle: &StaticSiteBundle,
    tree: &crate::workspace::WorkspaceTree,
    pages_dir: &Path,
) -> Result<(), String> {
    let file = File::create(zip_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default();

    zip_write_text(&mut zip, "index.html", &bundle.index_html, options)?;
    zip_write_text(&mut zip, "report.html", &bundle.report_html, options)?;
    zip_write_text(&mut zip, "deliverables.html", &bundle.deliverables_html, options)?;
    zip_write_text(&mut zip, "assets/site.css", build_site_css(), options)?;
    zip_write_text(&mut zip, "DEPLOY.md", &bundle.deploy_readme, options)?;
    zip_write_text(&mut zip, "netlify.toml", build_netlify_toml(), options)?;
    zip_write_text(&mut zip, "sitemap.xml", build_sitemap_xml(), options)?;
    zip_write_text(&mut zip, "vercel.json", build_vercel_json(), options)?;
    zip_write_text(&mut zip, "manifest.json", &bundle.manifest_json, options)?;

    let workspace_index_html = build_workspace_index_html(tree, &bundle.company_name);
    zip_write_text(
        &mut zip,
        "workspace/index.html",
        &workspace_index_html,
        options,
    )?;

    let folder_names: std::collections::HashMap<String, String> = tree
        .folders
        .iter()
        .map(|folder| (folder.id.clone(), slugify(&folder.name)))
        .collect();
    let folder_titles: std::collections::HashMap<String, String> = tree
        .folders
        .iter()
        .map(|folder| (folder.id.clone(), folder.name.clone()))
        .collect();

    let total_pages = tree.pages.len().max(1);
    if pages_dir.exists() {
        for (index, page) in tree.pages.iter().enumerate() {
            let md_path = pages_dir.join(format!("{}.md", page.id));
            if !md_path.exists() {
                continue;
            }
            let folder_slug = folder_names
                .get(&page.folder_id)
                .cloned()
                .unwrap_or_else(|| "uncategorized".to_string());
            let folder_name = folder_titles
                .get(&page.folder_id)
                .cloned()
                .unwrap_or_else(|| "Uncategorized".to_string());
            let page_slug = slugify(&page.title);
            let markdown = fs::read_to_string(&md_path).map_err(|e| e.to_string())?;
            let page_html = build_workspace_page_html(
                &page.title,
                &folder_name,
                &markdown,
                &bundle.company_name,
            );
            let archive_path = format!("workspace/{folder_slug}/{page_slug}.html");
            zip_write_text(&mut zip, &archive_path, &page_html, options)?;
            let percent = 45.0 + ((index + 1) as f64 / total_pages as f64) * 45.0;
            crate::progress::emit_progress(
                _app,
                "export_static_site",
                &format!("Packing page {} of {}…", index + 1, total_pages),
                percent,
            );
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn export_workspace_markdown_zip(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<ExportResult, String> {
    let progress = ProgressReporter::new(app.clone(), "export_workspace");
    progress.emit_percent("Loading workspace tree…", 20.0, Some("tree"));

    let company_id = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        if locked.company_id.is_empty() {
            return Err("Create a company before exporting workspace data.".to_string());
        }
        locked.company_id.clone()
    };
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = WorkspaceStorage::new(company_workspace_root(&app_data, &company_id))?;
    let pages_dir = company_workspace_root(&app_data, &company_id).join("pages");
    let exports_dir = exports_dir(&app)?;
    fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;

    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let zip_path = exports_dir.join(format!("soulcorp-workspace-{timestamp}.zip"));
    let tree = storage.list_tree()?;

    progress.emit_percent("Packing workspace Markdown…", 50.0, Some("zip"));
    let app_clone = app.clone();
    let zip_path_clone = zip_path.clone();
    tokio::task::spawn_blocking(move || {
        build_workspace_markdown_zip(&app_clone, &zip_path_clone, &tree, &pages_dir)
    })
    .await
    .map_err(|e| e.to_string())??;

    let mut locked = state.lock().map_err(|e| e.to_string())?;
    locked.stats.exports_created += 1;

    let result = ExportResult {
        path: zip_path.to_string_lossy().to_string(),
        format: "zip".to_string(),
        message: "Workspace export created with folder-organized Markdown.".to_string(),
    };
    commit(app, &locked)?;
    progress.finish("Workspace export complete");
    progress.clear();
    Ok(result)
}

fn build_workspace_markdown_zip(
    app: &AppHandle,
    zip_path: &Path,
    tree: &crate::workspace::WorkspaceTree,
    pages_dir: &Path,
) -> Result<(), String> {
    let file = File::create(zip_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default();
    let folder_names: std::collections::HashMap<String, String> = tree
        .folders
        .iter()
        .map(|folder| (folder.id.clone(), slugify(&folder.name)))
        .collect();
    let total_pages = tree.pages.len().max(1);

    if pages_dir.exists() {
        for (index, page) in tree.pages.iter().enumerate() {
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
            let percent = 50.0 + ((index + 1) as f64 / total_pages as f64) * 40.0;
            crate::progress::emit_progress(
                app,
                "export_workspace",
                &format!("Exporting page {} of {}…", index + 1, total_pages),
                percent,
            );
        }
    }

    let index = workspace_index(tree);
    zip.start_file("INDEX.md", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(index.as_bytes()).map_err(|e| e.to_string())?;

    let manifest = serde_json::to_string_pretty(tree).map_err(|e| e.to_string())?;
    zip.start_file("manifest.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(manifest.as_bytes())
        .map_err(|e| e.to_string())?;

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
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
    state.token_economy = backup.token_economy;
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

#[tauri::command]
pub fn export_qc_rated_deliverables_zip(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<ExportResult, String> {
    let exports_dir = exports_dir(&app)?;
    fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;

    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let zip_filename = format!("soulcorp-qc-deliverables-{timestamp}.zip");
    let zip_path = exports_dir.join(&zip_filename);
    let file = File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default();

    let (bundle, rated_count) = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        let (bundle, _) = prepare_static_site_bundle(&app, &locked, &zip_filename)?;
        let rated_count = crate::static_site::qc_rated_contracts(&locked.gig_contracts).len();
        (bundle, rated_count)
    };

    zip_write_text(&mut zip, "deliverables.html", &bundle.deliverables_html, options)?;
    zip_write_text(&mut zip, "manifest.json", &bundle.manifest_json, options)?;
    zip_write_text(&mut zip, "assets/site.css", build_site_css(), options)?;
    zip_write_text(
        &mut zip,
        "README.md",
        "# QC-rated deliverables\n\nPlatinum ≥90%, Gold ≥75%, Silver ≥60%, Bronze below 60%.\n",
        options,
    )?;

    zip.finish().map_err(|e| e.to_string())?;

    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.stats.exports_created += 1;
    let result = ExportResult {
        path: zip_path.to_string_lossy().to_string(),
        format: "zip".to_string(),
        message: format!(
            "QC-rated deliverables ZIP created with {rated_count} rated gig(s)."
        ),
    };
    commit(app, &state)?;
    Ok(result)
}
