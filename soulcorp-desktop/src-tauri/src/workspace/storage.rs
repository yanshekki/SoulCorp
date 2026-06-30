use super::models::{
    Block, CreatePageRequest, SearchResult, UpdatePageRequest, WorkspaceFolder, WorkspacePage,
    WorkspacePageSummary, WorkspaceTree, WorkspaceType,
};
use chrono::Utc;
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
        if self.read_folders()?.is_empty() {
            self.seed_defaults()?;
        }
        Ok(())
    }

    fn seed_defaults(&self) -> Result<(), String> {
        let now = Utc::now().to_rfc3339();
        let folders = vec![
            WorkspaceFolder {
                id: "folder-company".to_string(),
                name: "Company Docs".to_string(),
                icon: Some("🏢".to_string()),
                parent_id: None,
                workspace_type: WorkspaceType::Company,
                owner_id: "player".to_string(),
                is_private: false,
                permissions: vec![],
                created_at: now.clone(),
                updated_at: now.clone(),
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
            },
            WorkspaceFolder {
                id: "folder-agent-1".to_string(),
                name: "Mira".to_string(),
                icon: Some("👩‍💻".to_string()),
                parent_id: None,
                workspace_type: WorkspaceType::Agent,
                owner_id: "agent-1".to_string(),
                is_private: true,
                permissions: vec![],
                created_at: now.clone(),
                updated_at: now.clone(),
            },
            WorkspaceFolder {
                id: "folder-agent-2".to_string(),
                name: "Kai".to_string(),
                icon: Some("🧑‍💼".to_string()),
                parent_id: None,
                workspace_type: WorkspaceType::Agent,
                owner_id: "agent-2".to_string(),
                is_private: true,
                permissions: vec![],
                created_at: now.clone(),
                updated_at: now.clone(),
            },
            WorkspaceFolder {
                id: "folder-agent-3".to_string(),
                name: "Ren".to_string(),
                icon: Some("🧭".to_string()),
                parent_id: None,
                workspace_type: WorkspaceType::Agent,
                owner_id: "agent-3".to_string(),
                is_private: true,
                permissions: vec![],
                created_at: now.clone(),
                updated_at: now.clone(),
            },
        ];

        self.write_folders(&folders)?;

        let welcome = CreatePageRequest {
            folder_id: "folder-company".to_string(),
            title: "Welcome to SoulCorp Workspace".to_string(),
        };
        self.create_page(&welcome, "player")?;

        Ok(())
    }

    pub fn list_tree(&self) -> Result<WorkspaceTree, String> {
        let folders = self.read_folders()?;
        let pages = self
            .read_all_pages()?
            .into_iter()
            .map(|page| WorkspacePageSummary {
                id: page.id,
                title: page.title,
                folder_id: page.folder_id,
                last_edited_at: page.last_edited_at,
                last_edited_by: page.last_edited_by,
            })
            .collect();
        Ok(WorkspaceTree { folders, pages })
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
            linked_entities: vec![],
            last_edited_at: now,
            last_edited_by: editor.to_string(),
            version: 1,
            dirty: true,
        };

        self.write_page(&page)?;
        Ok(page)
    }

    pub fn update_page(&self, request: &UpdatePageRequest) -> Result<WorkspacePage, String> {
        let mut page = self.read_page(&request.page_id)?;
        if let Some(title) = &request.title {
            page.title = title.clone();
        }
        if let Some(blocks) = &request.blocks {
            page.blocks = blocks.clone();
        }
        if let Some(editor) = &request.last_edited_by {
            page.last_edited_by = editor.clone();
        }
        page.version += 1;
        page.last_edited_at = Utc::now().to_rfc3339();
        page.dirty = true;
        self.write_page(&page)?;
        Ok(page)
    }

    pub fn search(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        let needle = query.trim().to_lowercase();
        if needle.is_empty() {
            return Ok(vec![]);
        }

        let mut results = Vec::new();
        for page in self.read_all_pages()? {
            let haystack = format!(
                "{} {}",
                page.title.to_lowercase(),
                page.blocks
                    .iter()
                    .map(|block| block.content.to_lowercase())
                    .collect::<Vec<_>>()
                    .join(" ")
            );

            if haystack.contains(&needle) {
                let snippet = page
                    .blocks
                    .iter()
                    .find(|block| block.content.to_lowercase().contains(&needle))
                    .map(|block| block.content.clone())
                    .unwrap_or_else(|| page.title.clone());

                results.push(SearchResult {
                    page_id: page.id,
                    title: page.title,
                    folder_id: page.folder_id,
                    snippet,
                    score: 1.0,
                });
            }
        }

        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
        Ok(results)
    }

    pub fn append_meeting_notes(
        &self,
        meeting_type: &str,
        messages: &[(String, String)],
        participant_names: &[String],
    ) -> Result<Vec<WorkspacePage>, String> {
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
                content: format!("Participants: {}", participant_names.join(", ")),
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

        let company_updated = self.update_page(&UpdatePageRequest {
            page_id: company_page.id.clone(),
            title: None,
            blocks: Some(blocks),
            last_edited_by: Some("meeting-system".to_string()),
        })?;
        created.push(company_updated);

        for (index, name) in participant_names.iter().enumerate() {
            let folder_id = format!("folder-agent-{}", index + 1);
            if self.read_folders()?.iter().any(|f| f.id == folder_id) {
                let personal = self.create_page(
                    &CreatePageRequest {
                        folder_id,
                        title: format!("{name} — {meeting_type} Reflection"),
                    },
                    name,
                )?;
                created.push(personal);
            }
        }

        Ok(created)
    }

    fn folders_path(&self) -> PathBuf {
        self.root.join("folders.json")
    }

    fn pages_dir(&self) -> PathBuf {
        self.root.join("pages")
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
        Ok(())
    }

    fn read_all_pages(&self) -> Result<Vec<WorkspacePage>, String> {
        let dir = self.pages_dir();
        if !dir.exists() {
            return Ok(vec![]);
        }

        let mut pages = Vec::new();
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
            pages.push(serde_json::from_str(&raw).map_err(|e| e.to_string())?);
        }
        Ok(pages)
    }
}

pub fn workspace_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("workspaces")
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
