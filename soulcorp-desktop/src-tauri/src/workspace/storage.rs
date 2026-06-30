use super::models::{
    Block, CreatePageRequest, LinkedEntity, PageBacklink, SearchResult, UpdatePageRequest,
    WorkspaceFolder, WorkspacePage, WorkspacePageSummary, WorkspaceTree, WorkspaceType,
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
        };

        self.write_page(&page)?;
        Ok(page)
    }

    pub fn update_page(&self, request: &UpdatePageRequest) -> Result<WorkspacePage, String> {
        let mut page = self.read_page(&request.page_id)?;
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
        let needle = query.trim().to_lowercase();
        if needle.is_empty() {
            return Ok(vec![]);
        }

        let mut results = Vec::new();
        for page in self.read_all_pages()? {
            let rich_text = page
                .rich_doc
                .as_ref()
                .map(extract_text_from_rich_doc)
                .unwrap_or_default();
            let link_text = page
                .linked_entities
                .iter()
                .map(|link| format!("{} {}", link.entity_type, link.title))
                .collect::<Vec<_>>()
                .join(" ");
            let haystack = format!(
                "{} {} {} {}",
                page.title.to_lowercase(),
                page.blocks
                    .iter()
                    .map(|block| block.content.to_lowercase())
                    .collect::<Vec<_>>()
                    .join(" "),
                rich_text.to_lowercase(),
                link_text.to_lowercase()
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

    pub fn append_meeting_notes(
        &self,
        meeting_id: &str,
        meeting_type: &str,
        messages: &[(String, String)],
        participant_ids: &[String],
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

        let mut company_links = vec![LinkedEntity {
            entity_type: "meeting".to_string(),
            id: meeting_id.to_string(),
            title: format!("{meeting_type} meeting"),
        }];
        for (agent_id, name) in participant_ids.iter().zip(participant_names.iter()) {
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

        for (agent_id, name) in participant_ids.iter().zip(participant_names.iter()) {
            let folder_id = self
                .ensure_agent_folder(agent_id, name)
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

    pub fn ensure_agent_folder(&self, agent_id: &str, agent_name: &str) -> Result<String, String> {
        let folder_id = format!("folder-{agent_id}");
        let mut folders = self.read_folders()?;
        if folders.iter().any(|folder| folder.id == folder_id) {
            return Ok(folder_id);
        }

        let now = Utc::now().to_rfc3339();
        folders.push(WorkspaceFolder {
            id: folder_id.clone(),
            name: agent_name.to_string(),
            icon: Some("🤖".to_string()),
            parent_id: None,
            workspace_type: WorkspaceType::Agent,
            owner_id: agent_id.to_string(),
            is_private: true,
            permissions: vec![],
            created_at: now.clone(),
            updated_at: now,
        });
        self.write_folders(&folders)?;
        Ok(folder_id)
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
