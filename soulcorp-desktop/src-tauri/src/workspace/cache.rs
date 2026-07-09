use super::models::WorkspacePage;
use super::storage::{company_workspace_root, WorkspaceStorage};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

const PAGE_CACHE_MAX: usize = 64;

fn storage_roots() -> &'static Mutex<HashMap<String, PathBuf>> {
    static CACHE: OnceLock<Mutex<HashMap<String, PathBuf>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn page_cache() -> &'static Mutex<HashMap<(String, String), WorkspacePage>> {
    static CACHE: OnceLock<Mutex<HashMap<(String, String), WorkspacePage>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn open_cached_storage(
    app_data_dir: &PathBuf,
    company_id: &str,
) -> Result<WorkspaceStorage, String> {
    let root = {
        let mut guard = storage_roots().lock().map_err(|e| e.to_string())?;
        guard
            .entry(company_id.to_string())
            .or_insert_with(|| company_workspace_root(app_data_dir, company_id))
            .clone()
    };
    WorkspaceStorage::new(root)
}

pub fn get_cached_page(company_id: &str, page_id: &str) -> Option<WorkspacePage> {
    let guard = page_cache().lock().ok()?;
    guard
        .get(&(company_id.to_string(), page_id.to_string()))
        .cloned()
}

pub fn put_cached_page(company_id: &str, page: &WorkspacePage) {
    let Ok(mut guard) = page_cache().lock() else {
        return;
    };
    let key = (company_id.to_string(), page.id.clone());
    guard.remove(&key);
    guard.insert(key, page.clone());
    while guard.len() > PAGE_CACHE_MAX {
        if let Some(oldest) = guard.keys().next().cloned() {
            guard.remove(&oldest);
        } else {
            break;
        }
    }
}

pub fn invalidate_cached_page(company_id: &str, page_id: &str) {
    if let Ok(mut guard) = page_cache().lock() {
        guard.remove(&(company_id.to_string(), page_id.to_string()));
    }
}