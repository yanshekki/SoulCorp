use super::file_catalog::classify_file_name;
use super::index::WorkspaceIndex;
use super::models::{
    AddPageCommentRequest, Block, CreateFolderRequest, CreatePageRequest, DeleteFolderRequest,
    DeletePageRequest, DeleteWorkspaceFileRequest, ImportWorkspaceFilesRequest, LinkedEntity,
    PageBacklink, PageComment, PageVersionSummary, ReorderWorkspaceItemsRequest,
    ReorderWorkspacePagesRequest, ResolveWorkspaceItemsRequest, SearchResult, UpdatePageRequest,
    WorkspaceFile, WorkspaceFilePathResponse, WorkspaceFileSummary, WorkspaceFolder,
    WorkspaceFolderChildren, WorkspacePage, WorkspacePresenceEntry,
    WorkspaceSnapshot, WorkspaceSummaries, WorkspaceTree, WorkspaceType,
};
use std::collections::{HashMap, HashSet};
use chrono::Utc;
use rayon::prelude::*;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub struct WorkspaceStorage {
    root: PathBuf,
}

impl WorkspaceStorage {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        Ok(Self { root })
    }

    pub fn ensure_seed(&self) -> Result<(), String> {
        self.index().ensure_schema()?;
        if self.read_folders()?.is_empty() {
            self.seed_defaults()?;
        }
        self.ensure_index()?;
        Ok(())
    }

    fn index(&self) -> WorkspaceIndex {
        WorkspaceIndex::new(&self.root)
    }

    pub fn ensure_index(&self) -> Result<(), String> {
        let index = self.index();
        index.ensure_schema()?;
        if index.is_empty()? {
            let pages = self.read_all_pages()?;
            let files = self.read_all_files()?;
            if !pages.is_empty() || !files.is_empty() {
                index.rebuild(&pages, &files)?;
            }
        }
        Ok(())
    }

    fn sync_page_index(&self, page: &WorkspacePage) -> Result<(), String> {
        self.index().upsert_page(page)
    }

    fn remove_page_index(&self, page_id: &str) -> Result<(), String> {
        self.index().delete_page(page_id)
    }

    fn sync_file_index(&self, file: &WorkspaceFile) -> Result<(), String> {
        self.index().upsert_file(file)
    }

    fn remove_file_index(&self, file_id: &str) -> Result<(), String> {
        self.index().delete_file(file_id)
    }

    pub fn ensure_organization_structure(
        &self,
        departments: &[String],
        agents: &[(String, String, String)],
    ) -> Result<(), String> {
        let mut folders = self.read_folders()?;
        let now = Utc::now().to_rfc3339();
        let mut changed = false;

        if !folders.iter().any(|folder| folder.id == "folder-teams") {
            folders.push(WorkspaceFolder {
                id: "folder-teams".to_string(),
                name: "Teams".to_string(),
                icon: Some("👥".to_string()),
                parent_id: None,
                workspace_type: WorkspaceType::Company,
                owner_id: "player".to_string(),
                is_private: false,
                permissions: vec![],
                created_at: now.clone(),
                updated_at: now.clone(),
                sort_order: 0,
            });
            changed = true;
        }

        for department in departments {
            let folder_id = department_folder_id(department);
            if folders.iter().any(|folder| folder.id == folder_id) {
                continue;
            }
            folders.push(WorkspaceFolder {
                id: folder_id.clone(),
                name: department.clone(),
                icon: Some(department_icon(department)),
                parent_id: Some("folder-teams".to_string()),
                workspace_type: WorkspaceType::Department,
                owner_id: "player".to_string(),
                is_private: false,
                permissions: vec![],
                created_at: now.clone(),
                updated_at: now.clone(),
                sort_order: 0,
            });
            changed = true;
        }

        if let Some(projects) = folders.iter_mut().find(|folder| folder.id == "folder-projects") {
            if projects.parent_id.as_deref() != Some("folder-company") {
                projects.parent_id = Some("folder-company".to_string());
                projects.updated_at = now.clone();
                changed = true;
            }
        }

        for (agent_id, agent_name, department) in agents {
            let folder_id = format!("folder-{agent_id}");
            let parent_id = department_folder_id(department);
            if let Some(folder) = folders.iter_mut().find(|folder| folder.id == folder_id) {
                if folder.parent_id.as_deref() != Some(parent_id.as_str()) {
                    folder.parent_id = Some(parent_id);
                    folder.name = agent_name.clone();
                    folder.updated_at = now.clone();
                    changed = true;
                }
                continue;
            }
            folders.push(WorkspaceFolder {
                id: folder_id,
                name: agent_name.clone(),
                icon: Some("🤖".to_string()),
                parent_id: Some(parent_id),
                workspace_type: WorkspaceType::Agent,
                owner_id: agent_id.clone(),
                is_private: true,
                permissions: vec![],
                created_at: now.clone(),
                updated_at: now.clone(),
                sort_order: 0,
            });
            changed = true;
        }

        if changed {
            self.write_folders(&folders)?;
        }

        for department in departments {
            self.ensure_department_seed_pages(department)?;
        }

        Ok(())
    }

    fn ensure_department_seed_pages(&self, department: &str) -> Result<(), String> {
        let folder_id = department_folder_id(department);
        if !self
            .read_all_pages()?
            .iter()
            .any(|page| page.folder_id == folder_id && page.title == "Team Overview")
        {
            let overview = self.create_page(
                &CreatePageRequest {
                    folder_id: folder_id.clone(),
                    title: "Team Overview".to_string(),
                },
                "system",
            )?;
            self.update_page(&UpdatePageRequest {
                page_id: overview.id,
                title: None,
                blocks: Some(vec![
                    Block {
                        id: Uuid::new_v4().to_string(),
                        block_type: "heading".to_string(),
                        content: format!("{department} Team Overview"),
                        checked: None,
                    },
                    Block {
                        id: Uuid::new_v4().to_string(),
                        block_type: "text".to_string(),
                        content: "Mission, owners, rituals, and shared team context live here.".to_string(),
                        checked: None,
                    },
                    Block {
                        id: Uuid::new_v4().to_string(),
                        block_type: "heading".to_string(),
                        content: "Members".to_string(),
                        checked: None,
                    },
                    Block {
                        id: Uuid::new_v4().to_string(),
                        block_type: "text".to_string(),
                        content: "Link agents and projects from this page to keep the team board current.".to_string(),
                        checked: None,
                    },
                ]),
                rich_doc: None,
                linked_entities: None,
                last_edited_by: Some("system".to_string()),
            })?;
        }

        if !self
            .read_all_pages()?
            .iter()
            .any(|page| page.folder_id == folder_id && page.title == "Weekly Priorities")
        {
            self.create_page(
                &CreatePageRequest {
                    folder_id,
                    title: "Weekly Priorities".to_string(),
                },
                "system",
            )?;
        }

        Ok(())
    }

    fn seed_defaults(&self) -> Result<(), String> {
        let now = Utc::now().to_rfc3339();
        let departments = default_departments();
        let mut folders = vec![
            WorkspaceFolder {
                id: "folder-company".to_string(),
                name: "Company Hub".to_string(),
                icon: Some("🏢".to_string()),
                parent_id: None,
                workspace_type: WorkspaceType::Company,
                owner_id: "player".to_string(),
                is_private: false,
                permissions: vec![],
                created_at: now.clone(),
                updated_at: now.clone(),
                sort_order: 0,
            },
            WorkspaceFolder {
                id: "folder-projects".to_string(),
                name: "Projects".to_string(),
                icon: Some("📁".to_string()),
                parent_id: Some("folder-company".to_string()),
                workspace_type: WorkspaceType::Company,
                owner_id: "player".to_string(),
                is_private: false,
                permissions: vec![],
                created_at: now.clone(),
                updated_at: now.clone(),
                sort_order: 1,
            },
            WorkspaceFolder {
                id: "folder-teams".to_string(),
                name: "Teams".to_string(),
                icon: Some("👥".to_string()),
                parent_id: None,
                workspace_type: WorkspaceType::Company,
                owner_id: "player".to_string(),
                is_private: false,
                permissions: vec![],
                created_at: now.clone(),
                updated_at: now.clone(),
                sort_order: 2,
            },
        ];

        for department in &departments {
            folders.push(WorkspaceFolder {
                id: department_folder_id(department),
                name: department.clone(),
                icon: Some(department_icon(department)),
                parent_id: Some("folder-teams".to_string()),
                workspace_type: WorkspaceType::Department,
                owner_id: "player".to_string(),
                is_private: false,
                permissions: vec![],
                created_at: now.clone(),
                updated_at: now.clone(),
                sort_order: 0,
            });
        }

        self.write_folders(&folders)?;

        let welcome = CreatePageRequest {
            folder_id: "folder-company".to_string(),
            title: "Welcome to SoulCorp Workspace".to_string(),
        };
        self.create_page(&welcome, "player")?;

        for department in departments {
            self.ensure_department_seed_pages(&department)?;
        }

        Ok(())
    }

    pub fn list_snapshot(&self) -> Result<WorkspaceSnapshot, String> {
        self.ensure_index()?;
        let folders = self.read_folders()?;
        let (page_count, file_count) = self.index().counts()?;
        Ok(WorkspaceSnapshot {
            folders,
            page_count,
            file_count,
        })
    }

    pub fn list_summaries(&self) -> Result<WorkspaceSummaries, String> {
        self.ensure_index()?;
        Ok(WorkspaceSummaries {
            pages: self.index().list_page_summaries()?,
            files: self.index().list_file_summaries()?,
        })
    }

    pub fn list_folder_children(&self, folder_id: &str) -> Result<WorkspaceFolderChildren, String> {
        self.ensure_index()?;
        let folders = self.read_folders()?;
        if !folders.iter().any(|folder| folder.id == folder_id) {
            return Err("Folder not found.".to_string());
        }
        let (pages, files) = self.index().list_folder_children(folder_id)?;
        Ok(WorkspaceFolderChildren {
            folder_id: folder_id.to_string(),
            pages,
            files,
        })
    }

    pub fn resolve_items(
        &self,
        request: &ResolveWorkspaceItemsRequest,
    ) -> Result<WorkspaceSummaries, String> {
        self.ensure_index()?;
        let (pages, files) = self.index().resolve_items(&request.item_ids)?;
        Ok(WorkspaceSummaries { pages, files })
    }

    pub fn list_tree(&self) -> Result<WorkspaceTree, String> {
        self.normalize_folder_item_orders()?;
        self.ensure_index()?;
        let folders = self.read_folders()?;
        let summaries = self.list_summaries()?;
        Ok(WorkspaceTree {
            folders,
            pages: summaries.pages,
            files: summaries.files,
        })
    }

    pub fn get_page(&self, page_id: &str) -> Result<WorkspacePage, String> {
        self.read_page(page_id)
    }

    pub fn create_page(
        &self,
        request: &CreatePageRequest,
        editor: &str,
    ) -> Result<WorkspacePage, String> {
        let folders = self.read_folders()?;
        if !folders.iter().any(|folder| folder.id == request.folder_id) {
            return Err("Folder not found.".to_string());
        }

        let now = Utc::now().to_rfc3339();
        let sort_order = self.next_folder_item_sort_order(&request.folder_id)?;
        let page = WorkspacePage {
            id: format!("page-{}", Uuid::new_v4()),
            title: request.title.clone(),
            folder_id: request.folder_id.clone(),
            icon: None,
            blocks: vec![Block {
                id: Uuid::new_v4().to_string(),
                block_type: "text".to_string(),
                content: "Start writing...".to_string(),
                checked: None,
            }],
            rich_doc: Some(serde_json::json!({
                "type": "doc",
                "content": [{
                    "type": "paragraph",
                    "content": [{ "type": "text", "text": "Start writing..." }]
                }]
            })),
            linked_entities: vec![],
            last_edited_at: now,
            last_edited_by: editor.to_string(),
            version: 1,
            dirty: true,
            sort_order,
        };

        self.write_page(&page)?;
        Ok(page)
    }

    pub fn reorder_pages(&self, request: &ReorderWorkspacePagesRequest) -> Result<(), String> {
        let pages = self.read_all_pages()?;
        let mut folder_pages: Vec<&WorkspacePage> = pages
            .iter()
            .filter(|page| page.folder_id == request.folder_id)
            .collect();
        folder_pages.sort_by(|left, right| {
            left.sort_order
                .cmp(&right.sort_order)
                .then(left.last_edited_at.cmp(&right.last_edited_at))
                .then(left.title.cmp(&right.title))
        });

        if folder_pages.is_empty() {
            return Err("Folder has no pages to reorder.".to_string());
        }

        let folder_page_ids: HashSet<String> =
            folder_pages.iter().map(|page| page.id.clone()).collect();
        let mut ordered_ids: Vec<String> = request
            .page_ids
            .iter()
            .filter(|page_id| folder_page_ids.contains(*page_id))
            .cloned()
            .collect();

        for page in folder_pages {
            if !ordered_ids.iter().any(|page_id| page_id == &page.id) {
                ordered_ids.push(page.id.clone());
            }
        }

        for (index, page_id) in ordered_ids.iter().enumerate() {
            let mut page = self.read_page(page_id)?;
            page.sort_order = index as u32;
            self.write_page(&page)?;
        }

        Ok(())
    }

    fn next_folder_item_sort_order(&self, folder_id: &str) -> Result<u32, String> {
        let page_max = self
            .read_all_pages()?
            .into_iter()
            .filter(|page| page.folder_id == folder_id)
            .map(|page| page.sort_order)
            .max()
            .unwrap_or(0);
        let file_max = self
            .read_all_files()?
            .into_iter()
            .filter(|file| file.folder_id == folder_id)
            .map(|file| file.sort_order)
            .max()
            .unwrap_or(0);
        Ok(page_max.max(file_max).saturating_add(1))
    }

    fn normalize_folder_item_orders(&self) -> Result<(), String> {
        self.normalize_page_orders()?;
        self.normalize_file_orders()?;
        Ok(())
    }

    fn normalize_page_orders(&self) -> Result<(), String> {
        let pages = self.read_all_pages()?;
        let mut by_folder: HashMap<String, Vec<WorkspacePage>> = HashMap::new();
        for page in pages {
            by_folder
                .entry(page.folder_id.clone())
                .or_default()
                .push(page);
        }

        for mut folder_pages in by_folder.into_values() {
            let expected_orders: HashSet<u32> =
                (0..folder_pages.len() as u32).collect();
            let actual_orders: HashSet<u32> =
                folder_pages.iter().map(|page| page.sort_order).collect();
            if actual_orders == expected_orders {
                continue;
            }

            folder_pages.sort_by(|left, right| {
                left.sort_order
                    .cmp(&right.sort_order)
                    .then(left.last_edited_at.cmp(&right.last_edited_at))
                    .then(left.title.cmp(&right.title))
            });

            for (index, page) in folder_pages.iter_mut().enumerate() {
                if page.sort_order != index as u32 {
                    page.sort_order = index as u32;
                    self.write_page(page)?;
                }
            }
        }

        Ok(())
    }

    fn normalize_file_orders(&self) -> Result<(), String> {
        let files = self.read_all_files()?;
        let mut by_folder: HashMap<String, Vec<WorkspaceFile>> = HashMap::new();
        for file in files {
            by_folder
                .entry(file.folder_id.clone())
                .or_default()
                .push(file);
        }

        for mut folder_files in by_folder.into_values() {
            let expected_orders: HashSet<u32> =
                (0..folder_files.len() as u32).collect();
            let actual_orders: HashSet<u32> =
                folder_files.iter().map(|file| file.sort_order).collect();
            if actual_orders == expected_orders {
                continue;
            }

            folder_files.sort_by(|left, right| {
                left.sort_order
                    .cmp(&right.sort_order)
                    .then(left.uploaded_at.cmp(&right.uploaded_at))
                    .then(left.name.cmp(&right.name))
            });

            for (index, file) in folder_files.iter_mut().enumerate() {
                if file.sort_order != index as u32 {
                    file.sort_order = index as u32;
                    self.write_file(file)?;
                }
            }
        }

        Ok(())
    }

    pub fn import_files(
        &self,
        request: &ImportWorkspaceFilesRequest,
        editor: &str,
    ) -> Result<Vec<WorkspaceFileSummary>, String> {
        let folders = self.read_folders()?;
        if !folders.iter().any(|folder| folder.id == request.folder_id) {
            return Err("Folder not found.".to_string());
        }
        if request.source_paths.is_empty() {
            return Err("No files selected.".to_string());
        }

        let mut imported = Vec::new();
        for source_path in &request.source_paths {
            let source = Path::new(source_path);
            if !source.exists() || !source.is_file() {
                continue;
            }
            let file_name = source
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or_else(|| "Invalid file name.".to_string())?
                .to_string();
            let type_info = classify_file_name(&file_name)?;
            let metadata = fs::metadata(source).map_err(|e| e.to_string())?;
            let sort_order = self.next_folder_item_sort_order(&request.folder_id)?;
            let file = WorkspaceFile {
                id: format!("file-{}", Uuid::new_v4()),
                folder_id: request.folder_id.clone(),
                name: file_name,
                extension: type_info.extension,
                mime_type: type_info.mime_type,
                file_kind: type_info.kind,
                size_bytes: metadata.len(),
                uploaded_at: Utc::now().to_rfc3339(),
                uploaded_by: editor.to_string(),
                sort_order,
            };
            fs::create_dir_all(self.files_dir()).map_err(|e| e.to_string())?;
            fs::copy(source, self.file_blob_path(&file.id)).map_err(|e| e.to_string())?;
            self.write_file(&file)?;
            imported.push(file_to_summary(file));
        }

        if imported.is_empty() {
            return Err("No supported files could be imported.".to_string());
        }
        Ok(imported)
    }

    pub fn get_file(&self, file_id: &str) -> Result<WorkspaceFile, String> {
        self.read_file(file_id)
    }

    pub fn get_file_path_response(&self, file_id: &str) -> Result<WorkspaceFilePathResponse, String> {
        let file = self.read_file(file_id)?;
        let absolute_path = self
            .file_blob_path(&file.id)
            .canonicalize()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string();
        Ok(WorkspaceFilePathResponse {
            file_id: file.id,
            absolute_path,
            mime_type: file.mime_type,
            file_kind: file.file_kind,
        })
    }

    pub fn delete_file(&self, request: &DeleteWorkspaceFileRequest) -> Result<(), String> {
        let file = self.read_file(&request.file_id)?;
        let meta_path = self.file_meta_path(&file.id);
        let blob_path = self.file_blob_path(&file.id);
        if meta_path.exists() {
            fs::remove_file(meta_path).map_err(|e| e.to_string())?;
        }
        if blob_path.exists() {
            fs::remove_file(blob_path).map_err(|e| e.to_string())?;
        }
        self.remove_file_index(&request.file_id)?;
        Ok(())
    }

    pub fn reorder_items(&self, request: &ReorderWorkspaceItemsRequest) -> Result<(), String> {
        if request.item_ids.is_empty() {
            return Err("No items to reorder.".to_string());
        }

        let pages: HashMap<String, WorkspacePage> = self
            .read_all_pages()?
            .into_iter()
            .filter(|page| page.folder_id == request.folder_id)
            .map(|page| (page.id.clone(), page))
            .collect();
        let files: HashMap<String, WorkspaceFile> = self
            .read_all_files()?
            .into_iter()
            .filter(|file| file.folder_id == request.folder_id)
            .map(|file| (file.id.clone(), file))
            .collect();

        if pages.is_empty() && files.is_empty() {
            return Err("Folder has no items to reorder.".to_string());
        }

        let mut ordered_ids: Vec<String> = request
            .item_ids
            .iter()
            .filter(|item_id| pages.contains_key(*item_id) || files.contains_key(*item_id))
            .cloned()
            .collect();

        for page_id in pages.keys() {
            if !ordered_ids.iter().any(|item_id| item_id == page_id) {
                ordered_ids.push(page_id.clone());
            }
        }
        for file_id in files.keys() {
            if !ordered_ids.iter().any(|item_id| item_id == file_id) {
                ordered_ids.push(file_id.clone());
            }
        }

        for (index, item_id) in ordered_ids.iter().enumerate() {
            if let Some(mut page) = pages.get(item_id).cloned() {
                page.sort_order = index as u32;
                self.write_page(&page)?;
            } else if let Some(mut file) = files.get(item_id).cloned() {
                file.sort_order = index as u32;
                self.write_file(&file)?;
            }
        }

        Ok(())
    }

    pub fn update_page(&self, request: &UpdatePageRequest) -> Result<WorkspacePage, String> {
        let mut page = self.read_page(&request.page_id)?;
        self.snapshot_page_version(&page)?;
        if let Some(title) = &request.title {
            page.title = title.clone();
        }
        if let Some(rich_doc) = &request.rich_doc {
            page.rich_doc = Some(rich_doc.clone());
            page.blocks = blocks_from_rich_doc(rich_doc);
        } else if let Some(blocks) = &request.blocks {
            page.blocks = blocks.clone();
            page.rich_doc = Some(blocks_to_rich_doc(blocks));
        }
        if let Some(editor) = &request.last_edited_by {
            page.last_edited_by = editor.clone();
        }
        if let Some(links) = &request.linked_entities {
            page.linked_entities = links.clone();
        }
        page.version += 1;
        page.last_edited_at = Utc::now().to_rfc3339();
        page.dirty = true;
        self.write_page(&page)?;
        Ok(page)
    }

    pub fn search(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        self.ensure_index()?;
        self.index().search(query, 40)
    }

    pub fn link_entity_to_page(
        &self,
        page_id: &str,
        link: LinkedEntity,
        editor: &str,
    ) -> Result<WorkspacePage, String> {
        let mut page = self.read_page(page_id)?;
        if page
            .linked_entities
            .iter()
            .any(|existing| existing.entity_type == link.entity_type && existing.id == link.id)
        {
            return Ok(page);
        }
        self.snapshot_page_version(&page)?;
        page.linked_entities.push(link);
        page.version += 1;
        page.last_edited_at = Utc::now().to_rfc3339();
        page.last_edited_by = editor.to_string();
        page.dirty = true;
        self.write_page(&page)?;
        Ok(page)
    }

    pub fn unlink_entity_from_page(
        &self,
        page_id: &str,
        entity_type: &str,
        entity_id: &str,
        editor: &str,
    ) -> Result<WorkspacePage, String> {
        let mut page = self.read_page(page_id)?;
        self.snapshot_page_version(&page)?;
        page.linked_entities.retain(|link| {
            !(link.entity_type == entity_type && link.id == entity_id)
        });
        page.version += 1;
        page.last_edited_at = Utc::now().to_rfc3339();
        page.last_edited_by = editor.to_string();
        page.dirty = true;
        self.write_page(&page)?;
        Ok(page)
    }

    pub fn find_backlinks(&self, entity_type: &str, entity_id: &str) -> Result<Vec<PageBacklink>, String> {
        Ok(self
            .read_all_pages()?
            .into_iter()
            .filter(|page| {
                page.linked_entities.iter().any(|link| {
                    link.entity_type == entity_type && link.id == entity_id
                })
            })
            .map(|page| PageBacklink {
                page_id: page.id,
                title: page.title,
                folder_id: page.folder_id,
            })
            .collect())
    }

    pub fn find_page_linked_to_meeting(&self, meeting_id: &str) -> Result<Option<WorkspacePage>, String> {
        Ok(self
            .read_all_pages()?
            .into_iter()
            .find(|page| {
                page.linked_entities.iter().any(|link| {
                    link.entity_type == "meeting" && link.id == meeting_id
                })
            }))
    }

    pub fn append_meeting_notes(
        &self,
        meeting_id: &str,
        meeting_type: &str,
        messages: &[(String, String)],
        participants: &[(String, String, String)],
    ) -> Result<Vec<WorkspacePage>, String> {
        if let Some(existing) = self.find_page_linked_to_meeting(meeting_id)? {
            return Ok(vec![existing]);
        }

        let mut created = Vec::new();

        let company_page = self.create_page(
            &CreatePageRequest {
                folder_id: "folder-projects".to_string(),
                title: format!("Meeting Notes — {meeting_type}"),
            },
            "system",
        )?;

        let mut blocks = vec![
            Block {
                id: Uuid::new_v4().to_string(),
                block_type: "heading".to_string(),
                content: format!("{meeting_type} Summary"),
                checked: None,
            },
            Block {
                id: Uuid::new_v4().to_string(),
                block_type: "text".to_string(),
                content: format!(
                    "Participants: {}",
                    participants
                        .iter()
                        .map(|(_, name, _)| name.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
                checked: None,
            },
        ];

        for (speaker, content) in messages {
            blocks.push(Block {
                id: Uuid::new_v4().to_string(),
                block_type: "text".to_string(),
                content: format!("{speaker}: {content}"),
                checked: None,
            });
        }

        let mut company_links = vec![LinkedEntity {
            entity_type: "meeting".to_string(),
            id: meeting_id.to_string(),
            title: format!("{meeting_type} meeting"),
        }];
        for (agent_id, name, _) in participants {
            company_links.push(LinkedEntity {
                entity_type: "agent".to_string(),
                id: agent_id.clone(),
                title: name.clone(),
            });
        }

        let company_updated = self.update_page(&UpdatePageRequest {
            page_id: company_page.id.clone(),
            title: None,
            blocks: Some(blocks),
            rich_doc: None,
            linked_entities: Some(company_links),
            last_edited_by: Some("meeting-system".to_string()),
        })?;
        created.push(company_updated);

        for (agent_id, name, department) in participants {
            let folder_id = self
                .ensure_agent_folder(agent_id, name, department)
                .unwrap_or_else(|_| format!("folder-{agent_id}"));
            if self.read_folders()?.iter().any(|f| f.id == folder_id) {
                let personal = self.create_page(
                    &CreatePageRequest {
                        folder_id,
                        title: format!("{name} — {meeting_type} Reflection"),
                    },
                    name,
                )?;
                let linked = self.link_entity_to_page(
                    &personal.id,
                    LinkedEntity {
                        entity_type: "meeting".to_string(),
                        id: meeting_id.to_string(),
                        title: format!("{meeting_type} meeting"),
                    },
                    name,
                )?;
                let linked = self.link_entity_to_page(
                    &linked.id,
                    LinkedEntity {
                        entity_type: "agent".to_string(),
                        id: agent_id.clone(),
                        title: name.clone(),
                    },
                    name,
                )?;
                created.push(linked);
            }
        }

        Ok(created)
    }

    pub fn write_agent_soul_file(&self, agent_id: &str, content: &str) -> Result<(), String> {
        let dir = self.root.join("agent-souls");
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        fs::write(dir.join(format!("{agent_id}.md")), content).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn ensure_agent_folder(
        &self,
        agent_id: &str,
        agent_name: &str,
        department: &str,
    ) -> Result<String, String> {
        let folder_id = format!("folder-{agent_id}");
        let parent_id = department_folder_id(department);
        let mut folders = self.read_folders()?;
        if let Some(folder) = folders.iter_mut().find(|folder| folder.id == folder_id) {
            if folder.parent_id.as_deref() != Some(parent_id.as_str()) {
                folder.parent_id = Some(parent_id);
                folder.name = agent_name.to_string();
                folder.updated_at = Utc::now().to_rfc3339();
                self.write_folders(&folders)?;
            }
            return Ok(folder_id);
        }

        let now = Utc::now().to_rfc3339();
        folders.push(WorkspaceFolder {
            id: folder_id.clone(),
            name: agent_name.to_string(),
            icon: Some("🤖".to_string()),
            parent_id: Some(parent_id),
            workspace_type: WorkspaceType::Agent,
            owner_id: agent_id.to_string(),
            is_private: true,
            permissions: vec![],
            created_at: now.clone(),
            updated_at: now,
            sort_order: 0,
        });
        self.write_folders(&folders)?;
        Ok(folder_id)
    }

    pub fn create_folder(&self, request: &CreateFolderRequest) -> Result<WorkspaceFolder, String> {
        let mut folders = self.read_folders()?;
        let parent = folders
            .iter()
            .find(|folder| folder.id == request.parent_id)
            .ok_or_else(|| "Parent folder not found.".to_string())?;

        if !matches!(
            parent.workspace_type,
            WorkspaceType::Company | WorkspaceType::Department | WorkspaceType::Custom
        ) {
            return Err("Custom folders can only be created under company or team folders.".to_string());
        }

        let name = request.name.trim();
        if name.len() < 2 {
            return Err("Folder name must be at least 2 characters.".to_string());
        }

        let now = Utc::now().to_rfc3339();
        let sort_order = self.next_folder_sort_order(&request.parent_id)?;
        let folder = WorkspaceFolder {
            id: format!("folder-custom-{}", Uuid::new_v4()),
            name: name.to_string(),
            icon: Some("📂".to_string()),
            parent_id: Some(request.parent_id.clone()),
            workspace_type: WorkspaceType::Custom,
            owner_id: "player".to_string(),
            is_private: false,
            permissions: vec![],
            created_at: now.clone(),
            updated_at: now,
            sort_order,
        };
        folders.push(folder.clone());
        self.write_folders(&folders)?;
        Ok(folder)
    }

    pub fn delete_page(&self, request: &DeletePageRequest) -> Result<(), String> {
        let _ = self.read_page(&request.page_id)?;
        let json_path = self.pages_dir().join(format!("{}.json", request.page_id));
        let md_path = self.pages_dir().join(format!("{}.md", request.page_id));
        let versions_dir = self.versions_dir().join(&request.page_id);
        let comments_path = self.comments_dir().join(format!("{}.json", request.page_id));

        if json_path.exists() {
            fs::remove_file(json_path).map_err(|e| e.to_string())?;
        }
        if md_path.exists() {
            fs::remove_file(md_path).map_err(|e| e.to_string())?;
        }
        if versions_dir.exists() {
            fs::remove_dir_all(versions_dir).map_err(|e| e.to_string())?;
        }
        if comments_path.exists() {
            fs::remove_file(comments_path).map_err(|e| e.to_string())?;
        }

        let mut presence = self.read_presence()?;
        let before = presence.len();
        presence.retain(|entry| entry.page_id != request.page_id);
        if presence.len() != before {
            self.write_presence(&presence)?;
        }

        self.remove_page_index(&request.page_id)?;
        Ok(())
    }

    pub fn delete_folder(&self, request: &DeleteFolderRequest) -> Result<(), String> {
        let folders = self.read_folders()?;
        let folder = folders
            .iter()
            .find(|folder| folder.id == request.folder_id)
            .ok_or_else(|| "Folder not found.".to_string())?;

        if !matches!(folder.workspace_type, WorkspaceType::Custom) {
            return Err("Only custom team folders can be deleted.".to_string());
        }

        let has_child_folders = folders
            .iter()
            .any(|child| child.parent_id.as_deref() == Some(request.folder_id.as_str()));
        if has_child_folders {
            return Err("Remove nested folders before deleting this folder.".to_string());
        }

        let has_pages = self
            .read_all_pages()?
            .iter()
            .any(|page| page.folder_id == request.folder_id);
        if has_pages {
            return Err("Delete or move pages out of this folder first.".to_string());
        }

        let has_files = self
            .read_all_files()?
            .iter()
            .any(|file| file.folder_id == request.folder_id);
        if has_files {
            return Err("Delete or move files out of this folder first.".to_string());
        }

        let mut folders = folders;
        folders.retain(|entry| entry.id != request.folder_id);
        self.write_folders(&folders)?;
        Ok(())
    }

    pub fn find_page_in_folder(&self, folder_id: &str, title: &str) -> Result<Option<WorkspacePage>, String> {
        Ok(self
            .read_all_pages()?
            .into_iter()
            .find(|page| page.folder_id == folder_id && page.title == title))
    }

    pub fn append_journal_entry(
        &self,
        folder_id: &str,
        journal_title: &str,
        heading: &str,
        lines: &[String],
        editor: &str,
    ) -> Result<WorkspacePage, String> {
        let page = if let Some(existing) = self.find_page_in_folder(folder_id, journal_title)? {
            existing
        } else {
            self.create_page(
                &CreatePageRequest {
                    folder_id: folder_id.to_string(),
                    title: journal_title.to_string(),
                },
                editor,
            )?
        };

        let mut blocks = page.blocks.clone();
        blocks.retain(|block| block.content != "Start writing...");

        blocks.push(Block {
            id: Uuid::new_v4().to_string(),
            block_type: "heading".to_string(),
            content: heading.to_string(),
            checked: None,
        });

        for line in lines {
            if line.trim().is_empty() {
                continue;
            }
            blocks.push(Block {
                id: Uuid::new_v4().to_string(),
                block_type: "text".to_string(),
                content: line.clone(),
                checked: None,
            });
        }

        self.update_page(&UpdatePageRequest {
            page_id: page.id,
            title: None,
            blocks: Some(blocks),
            rich_doc: None,
            linked_entities: None,
            last_edited_by: Some(editor.to_string()),
        })
    }

    pub fn append_company_feed_entry(
        &self,
        day_number: u32,
        title: &str,
        body: &str,
    ) -> Result<WorkspacePage, String> {
        const FEED_TITLE: &str = "Company Activity Feed";
        let heading = format!("Day {day_number} — {title}");
        self.append_journal_entry(
            "folder-company",
            FEED_TITLE,
            &heading,
            &[body.to_string()],
            "activity-system",
        )
    }

    fn folders_path(&self) -> PathBuf {
        self.root.join("folders.json")
    }

    fn pages_dir(&self) -> PathBuf {
        self.root.join("pages")
    }

    fn files_dir(&self) -> PathBuf {
        self.root.join("files")
    }

    fn file_meta_path(&self, file_id: &str) -> PathBuf {
        self.files_dir().join(format!("{file_id}.json"))
    }

    fn file_blob_path(&self, file_id: &str) -> PathBuf {
        self.files_dir().join(format!("{file_id}.bin"))
    }

    fn read_file(&self, file_id: &str) -> Result<WorkspaceFile, String> {
        let path = self.file_meta_path(file_id);
        let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map_err(|e| e.to_string())
    }

    fn write_file(&self, file: &WorkspaceFile) -> Result<(), String> {
        fs::create_dir_all(self.files_dir()).map_err(|e| e.to_string())?;
        let json = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
        fs::write(self.file_meta_path(&file.id), json).map_err(|e| e.to_string())?;
        self.sync_file_index(file)
    }

    fn read_all_files(&self) -> Result<Vec<WorkspaceFile>, String> {
        let dir = self.files_dir();
        if !dir.exists() {
            return Ok(vec![]);
        }

        let paths: Vec<PathBuf> = fs::read_dir(dir)
            .map_err(|e| e.to_string())?
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("json") {
                    Some(path)
                } else {
                    None
                }
            })
            .collect();

        paths
            .par_iter()
            .map(|path| {
                let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
                serde_json::from_str(&raw).map_err(|e| e.to_string())
            })
            .collect()
    }

    fn versions_dir(&self) -> PathBuf {
        self.root.join("versions")
    }

    fn comments_dir(&self) -> PathBuf {
        self.root.join("comments")
    }

    fn presence_path(&self) -> PathBuf {
        self.root.join("presence.json")
    }

    pub fn snapshot_page_version(&self, page: &WorkspacePage) -> Result<(), String> {
        let dir = self.versions_dir().join(&page.id);
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join(format!("v{}.json", page.version));
        if path.exists() {
            return Ok(());
        }
        let json = serde_json::to_string_pretty(page).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_page_versions(&self, page_id: &str) -> Result<Vec<PageVersionSummary>, String> {
        let dir = self.versions_dir().join(page_id);
        if !dir.exists() {
            let page = self.read_page(page_id)?;
            return Ok(vec![PageVersionSummary {
                version: page.version,
                saved_at: page.last_edited_at.clone(),
                editor: page.last_edited_by.clone(),
                title: page.title.clone(),
            }]);
        }

        let mut versions = Vec::new();
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let file_name = entry.file_name().to_string_lossy().to_string();
            if !file_name.starts_with('v') || !file_name.ends_with(".json") {
                continue;
            }
            let raw = fs::read_to_string(entry.path()).map_err(|e| e.to_string())?;
            let page: WorkspacePage = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
            versions.push(PageVersionSummary {
                version: page.version,
                saved_at: page.last_edited_at.clone(),
                editor: page.last_edited_by.clone(),
                title: page.title.clone(),
            });
        }
        versions.sort_by_key(|b| std::cmp::Reverse(b.version));
        if versions.is_empty() {
            let page = self.read_page(page_id)?;
            versions.push(PageVersionSummary {
                version: page.version,
                saved_at: page.last_edited_at.clone(),
                editor: page.last_edited_by.clone(),
                title: page.title.clone(),
            });
        }
        Ok(versions)
    }

    pub fn restore_page_version(
        &self,
        page_id: &str,
        version: u32,
        editor: &str,
    ) -> Result<WorkspacePage, String> {
        let path = self.versions_dir().join(page_id).join(format!("v{version}.json"));
        let snapshot = if path.exists() {
            let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
            serde_json::from_str::<WorkspacePage>(&raw).map_err(|e| e.to_string())?
        } else {
            return Err(format!("Version {version} not found for page {page_id}."));
        };

        let mut page = self.read_page(page_id)?;
        self.snapshot_page_version(&page)?;
        page.title = snapshot.title;
        page.blocks = snapshot.blocks;
        page.rich_doc = snapshot.rich_doc;
        page.linked_entities = snapshot.linked_entities;
        page.version += 1;
        page.last_edited_at = Utc::now().to_rfc3339();
        page.last_edited_by = editor.to_string();
        page.dirty = true;
        self.write_page(&page)?;
        Ok(page)
    }

    pub fn list_page_comments(&self, page_id: &str) -> Result<Vec<PageComment>, String> {
        let path = self.comments_dir().join(format!("{page_id}.json"));
        if !path.exists() {
            return Ok(vec![]);
        }
        let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map_err(|e| e.to_string())
    }

    pub fn add_page_comment(&self, request: &AddPageCommentRequest) -> Result<PageComment, String> {
        let _ = self.read_page(&request.page_id)?;
        let mut comments = self.list_page_comments(&request.page_id)?;
        let mentions = extract_mentions(&request.content);
        let comment = PageComment {
            id: format!("comment-{}", Uuid::new_v4()),
            page_id: request.page_id.clone(),
            author: request.author.clone(),
            content: request.content.clone(),
            mentions,
            created_at: Utc::now().to_rfc3339(),
        };
        comments.push(comment.clone());
        fs::create_dir_all(self.comments_dir()).map_err(|e| e.to_string())?;
        let path = self.comments_dir().join(format!("{}.json", request.page_id));
        let json = serde_json::to_string_pretty(&comments).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| e.to_string())?;
        Ok(comment)
    }

    pub fn set_workspace_presence(&self, page_id: &str, editor: &str) -> Result<(), String> {
        let mut entries = self.read_presence()?;
        entries.retain(|entry| entry.editor != editor);
        entries.push(WorkspacePresenceEntry {
            page_id: page_id.to_string(),
            editor: editor.to_string(),
            updated_at: Utc::now().to_rfc3339(),
        });
        self.write_presence(&entries)
    }

    pub fn clear_workspace_presence(&self, editor: &str) -> Result<(), String> {
        let mut entries = self.read_presence()?;
        entries.retain(|entry| entry.editor != editor);
        self.write_presence(&entries)
    }

    pub fn get_workspace_presence(&self, page_id: &str) -> Result<Vec<WorkspacePresenceEntry>, String> {
        Ok(self
            .read_presence()?
            .into_iter()
            .filter(|entry| entry.page_id == page_id)
            .collect())
    }

    fn read_presence(&self) -> Result<Vec<WorkspacePresenceEntry>, String> {
        let path = self.presence_path();
        if !path.exists() {
            return Ok(vec![]);
        }
        let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map_err(|e| e.to_string())
    }

    fn write_presence(&self, entries: &[WorkspacePresenceEntry]) -> Result<(), String> {
        let json = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
        fs::write(self.presence_path(), json).map_err(|e| e.to_string())
    }

    fn next_folder_sort_order(&self, parent_id: &str) -> Result<u32, String> {
        let max_order = self
            .read_folders()?
            .into_iter()
            .filter(|folder| folder.parent_id.as_deref() == Some(parent_id))
            .map(|folder| folder.sort_order)
            .max()
            .unwrap_or(0);
        Ok(max_order.saturating_add(1))
    }

    fn read_folders(&self) -> Result<Vec<WorkspaceFolder>, String> {
        let path = self.folders_path();
        if !path.exists() {
            return Ok(vec![]);
        }
        let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map_err(|e| e.to_string())
    }

    fn write_folders(&self, folders: &[WorkspaceFolder]) -> Result<(), String> {
        let raw = serde_json::to_string_pretty(folders).map_err(|e| e.to_string())?;
        fs::write(self.folders_path(), raw).map_err(|e| e.to_string())
    }

    fn read_page(&self, page_id: &str) -> Result<WorkspacePage, String> {
        let json_path = self.pages_dir().join(format!("{page_id}.json"));
        let raw = fs::read_to_string(json_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map_err(|e| e.to_string())
    }

    fn write_page(&self, page: &WorkspacePage) -> Result<(), String> {
        fs::create_dir_all(self.pages_dir()).map_err(|e| e.to_string())?;
        let json_path = self.pages_dir().join(format!("{}.json", page.id));
        let md_path = self.pages_dir().join(format!("{}.md", page.id));

        let json = serde_json::to_string_pretty(page).map_err(|e| e.to_string())?;
        fs::write(json_path, json).map_err(|e| e.to_string())?;
        fs::write(md_path, page_to_markdown(page)).map_err(|e| e.to_string())?;
        self.sync_page_index(page)?;
        Ok(())
    }

    fn read_all_pages(&self) -> Result<Vec<WorkspacePage>, String> {
        let dir = self.pages_dir();
        if !dir.exists() {
            return Ok(vec![]);
        }

        let paths: Vec<PathBuf> = fs::read_dir(dir)
            .map_err(|e| e.to_string())?
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("json") {
                    Some(path)
                } else {
                    None
                }
            })
            .collect();

        paths
            .par_iter()
            .map(|path| {
                let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
                serde_json::from_str(&raw).map_err(|e| e.to_string())
            })
            .collect()
    }
}

fn format_file_size(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    let size = bytes as f64;
    if size >= GB {
        format!("{:.1} GB", size / GB)
    } else if size >= MB {
        format!("{:.1} MB", size / MB)
    } else if size >= KB {
        format!("{:.1} KB", size / KB)
    } else {
        format!("{bytes} B")
    }
}

fn file_to_summary(file: WorkspaceFile) -> WorkspaceFileSummary {
    WorkspaceFileSummary {
        id: file.id,
        folder_id: file.folder_id,
        name: file.name,
        extension: file.extension,
        mime_type: file.mime_type,
        file_kind: file.file_kind,
        size_bytes: file.size_bytes,
        uploaded_at: file.uploaded_at,
        uploaded_by: file.uploaded_by,
        sort_order: file.sort_order,
    }
}

pub fn company_workspace_root(app_data_dir: &Path, company_id: &str) -> PathBuf {
    app_data_dir.join("companies").join(company_id).join("workspace")
}

fn blocks_to_rich_doc(blocks: &[Block]) -> serde_json::Value {
    let content: Vec<serde_json::Value> = blocks
        .iter()
        .filter(|block| !block.content.is_empty())
        .map(|block| match block.block_type.as_str() {
            "heading" => serde_json::json!({
                "type": "heading",
                "attrs": { "level": 2 },
                "content": [{ "type": "text", "text": block.content }]
            }),
            "todo" => serde_json::json!({
                "type": "taskList",
                "content": [{
                    "type": "taskItem",
                    "attrs": { "checked": block.checked.unwrap_or(false) },
                    "content": [{
                        "type": "paragraph",
                        "content": [{ "type": "text", "text": block.content }]
                    }]
                }]
            }),
            _ => serde_json::json!({
                "type": "paragraph",
                "content": [{ "type": "text", "text": block.content }]
            }),
        })
        .collect();

    serde_json::json!({
        "type": "doc",
        "content": if content.is_empty() {
            vec![serde_json::json!({ "type": "paragraph" })]
        } else {
            content
        }
    })
}

fn blocks_from_rich_doc(doc: &serde_json::Value) -> Vec<Block> {
    let mut blocks = Vec::new();
    let Some(content) = doc.get("content").and_then(|value| value.as_array()) else {
        return blocks;
    };

    for node in content {
        let node_type = node.get("type").and_then(|value| value.as_str()).unwrap_or("paragraph");
        let text = extract_node_text(node);
        if text.trim().is_empty() {
            continue;
        }

        match node_type {
            "heading" => blocks.push(Block {
                id: Uuid::new_v4().to_string(),
                block_type: "heading".to_string(),
                content: text,
                checked: None,
            }),
            "taskList" => {
                if let Some(items) = node.get("content").and_then(|value| value.as_array()) {
                    for item in items {
                        let item_text = extract_node_text(item);
                        if item_text.trim().is_empty() {
                            continue;
                        }
                        blocks.push(Block {
                            id: Uuid::new_v4().to_string(),
                            block_type: "todo".to_string(),
                            content: item_text,
                            checked: item
                                .get("attrs")
                                .and_then(|attrs| attrs.get("checked"))
                                .and_then(|value| value.as_bool()),
                        });
                    }
                }
            }
            _ => blocks.push(Block {
                id: Uuid::new_v4().to_string(),
                block_type: "text".to_string(),
                content: text,
                checked: None,
            }),
        }
    }

    if blocks.is_empty() {
        blocks.push(Block {
            id: Uuid::new_v4().to_string(),
            block_type: "text".to_string(),
            content: String::new(),
            checked: None,
        });
    }

    blocks
}

fn extract_text_from_rich_doc(doc: &serde_json::Value) -> String {
    doc.get("content")
        .and_then(|value| value.as_array())
        .map(|nodes| {
            nodes
                .iter()
                .map(extract_node_text)
                .filter(|text| !text.trim().is_empty())
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default()
}

fn extract_node_text(node: &serde_json::Value) -> String {
    if let Some(text) = node.get("text").and_then(|value| value.as_str()) {
        return text.to_string();
    }

    node.get("content")
        .and_then(|value| value.as_array())
        .map(|children| {
            children
                .iter()
                .map(extract_node_text)
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default()
}

fn page_to_markdown(page: &WorkspacePage) -> String {
    let mut lines = vec![format!("# {}", page.title), String::new()];
    for block in &page.blocks {
        match block.block_type.as_str() {
            "heading" => lines.push(format!("## {}", block.content)),
            "todo" => lines.push(format!(
                "- [{}] {}",
                if block.checked.unwrap_or(false) {
                    "x"
                } else {
                    " "
                },
                block.content
            )),
            _ => lines.push(block.content.clone()),
        }
        lines.push(String::new());
    }
    lines.join("\n")
}

fn extract_mentions(content: &str) -> Vec<String> {
    content
        .split_whitespace()
        .filter_map(|token| token.strip_prefix('@'))
        .map(|name| name.trim_matches(|c: char| !c.is_alphanumeric() && c != '-').to_string())
        .filter(|name| !name.is_empty())
        .collect()
}

pub fn default_departments() -> Vec<String> {
    vec![
        "Engineering".to_string(),
        "Human Resources".to_string(),
        "Executive".to_string(),
        "Marketing".to_string(),
        "Marketplace".to_string(),
    ]
}

fn department_slug(department: &str) -> String {
    department
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

pub fn department_folder_id(department: &str) -> String {
    match department.to_lowercase().as_str() {
        "engineering" => "folder-dept-engineering".to_string(),
        "human resources" => "folder-dept-hr".to_string(),
        "executive" => "folder-dept-executive".to_string(),
        "marketing" => "folder-dept-marketing".to_string(),
        "marketplace" => "folder-dept-marketplace".to_string(),
        other => format!("folder-dept-{}", department_slug(other)),
    }
}

fn department_icon(department: &str) -> String {
    match department.to_lowercase().as_str() {
        "engineering" => "🛠".to_string(),
        "human resources" => "👥".to_string(),
        "executive" => "💼".to_string(),
        "marketing" => "📣".to_string(),
        "marketplace" => "🏪".to_string(),
        _ => "📂".to_string(),
    }
}

#[cfg(test)]
mod organization_tests {
    use super::*;

    fn temp_storage() -> WorkspaceStorage {
        let root = std::env::temp_dir().join(format!("soulcorp-ws-test-{}", Uuid::new_v4()));
        let storage = WorkspaceStorage::new(root).expect("temp workspace");
        storage.ensure_seed().expect("seed workspace");
        storage
    }

    #[test]
    fn department_folder_ids_are_stable() {
        assert_eq!(department_folder_id("Engineering"), "folder-dept-engineering");
        assert_eq!(department_folder_id("Human Resources"), "folder-dept-hr");
    }

    #[test]
    fn reorder_pages_appends_missing_page_ids() {
        let storage = temp_storage();
        let folder_id = "folder-company".to_string();
        let first = storage
            .create_page(
                &CreatePageRequest {
                    folder_id: folder_id.clone(),
                    title: "First".to_string(),
                },
                "player",
            )
            .expect("create first page");
        let second = storage
            .create_page(
                &CreatePageRequest {
                    folder_id: folder_id.clone(),
                    title: "Second".to_string(),
                },
                "player",
            )
            .expect("create second page");
        let third = storage
            .create_page(
                &CreatePageRequest {
                    folder_id: folder_id.clone(),
                    title: "Third".to_string(),
                },
                "player",
            )
            .expect("create third page");

        storage
            .reorder_pages(&ReorderWorkspacePagesRequest {
                folder_id: folder_id.clone(),
                page_ids: vec![third.id.clone(), first.id.clone()],
            })
            .expect("reorder with partial ids");

        let tree = storage.list_tree().expect("list tree");
        let mut folder_pages: Vec<_> = tree
            .pages
            .into_iter()
            .filter(|page| page.folder_id == folder_id)
            .collect();
        folder_pages.sort_by_key(|page| page.sort_order);
        let ordered_ids: Vec<String> = folder_pages.iter().map(|page| page.id.clone()).collect();

        assert_eq!(ordered_ids[0], third.id);
        assert_eq!(ordered_ids[1], first.id);
        assert!(ordered_ids.contains(&second.id));
        assert_eq!(
            folder_pages.iter().map(|page| page.sort_order).collect::<Vec<_>>(),
            (0..folder_pages.len() as u32).collect::<Vec<_>>()
        );
    }

    #[test]
    fn normalize_page_orders_reindexes_one_based_legacy_orders() {
        let storage = temp_storage();
        let folder_id = "folder-company".to_string();
        storage
            .create_page(
                &CreatePageRequest {
                    folder_id: folder_id.clone(),
                    title: "Legacy A".to_string(),
                },
                "player",
            )
            .expect("create legacy a");
        storage
            .create_page(
                &CreatePageRequest {
                    folder_id: folder_id.clone(),
                    title: "Legacy B".to_string(),
                },
                "player",
            )
            .expect("create legacy b");

        let mut legacy_pages: Vec<WorkspacePage> = storage
            .read_all_pages()
            .expect("read pages")
            .into_iter()
            .filter(|page| page.folder_id == folder_id)
            .collect();
        for (index, page) in legacy_pages.iter_mut().enumerate() {
            page.sort_order = (index + 1) as u32;
            storage.write_page(page).expect("write legacy order");
        }

        let tree = storage.list_tree().expect("normalize via list_tree");
        let mut folder_pages: Vec<_> = tree
            .pages
            .into_iter()
            .filter(|page| page.folder_id == folder_id)
            .collect();
        folder_pages.sort_by_key(|page| page.sort_order);

        assert_eq!(
            folder_pages.iter().map(|page| page.sort_order).collect::<Vec<_>>(),
            (0..folder_pages.len() as u32).collect::<Vec<_>>()
        );
    }
}
