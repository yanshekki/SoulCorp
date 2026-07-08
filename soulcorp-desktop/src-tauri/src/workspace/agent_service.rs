use super::index::page_index_body;
use super::models::{
    AgentWorkspaceActivityEntry, AgentWorkspaceContext, AgentWorkspacePageView, Block,
    CreatePageRequest, LinkedEntity, SearchResult, UpdatePageRequest, WorkspaceFolderChildren,
    WorkspacePage, WorkspaceType,
};
use uuid::Uuid;
use super::storage::{department_folder_id, WorkspaceStorage};
use std::collections::HashSet;

#[derive(Debug, Clone)]
pub struct AgentContext {
    pub id: String,
    pub name: String,
    pub department: String,
}

impl AgentContext {
    pub fn from_record(agent: &crate::state::AgentRecord) -> Self {
        Self {
            id: agent.id.clone(),
            name: agent.name.clone(),
            department: agent.department.clone(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum PermissionLevel {
    Read,
    Append,
    Write,
}

impl PermissionLevel {
    fn satisfies(self, required: PermissionLevel) -> bool {
        self >= required
    }
}

pub struct AgentWorkspaceService<'a> {
    storage: &'a WorkspaceStorage,
}

impl<'a> AgentWorkspaceService<'a> {
    pub fn new(storage: &'a WorkspaceStorage) -> Self {
        Self { storage }
    }

    pub fn agent_folder_id(agent_id: &str) -> String {
        format!("folder-{agent_id}")
    }

    pub fn ensure_agent_folder(&self, agent: &AgentContext) -> Result<String, String> {
        self.storage
            .ensure_agent_folder(&agent.id, &agent.name, &agent.department)
    }

    pub fn list_folder(&self, agent: &AgentContext) -> Result<WorkspaceFolderChildren, String> {
        self.ensure_agent_folder(agent)?;
        self.storage
            .list_folder_children(&Self::agent_folder_id(&agent.id))
    }

    pub fn read_page(&self, agent: &AgentContext, page_id: &str) -> Result<AgentWorkspacePageView, String> {
        let page = self.storage.get_page(page_id)?;
        self.assert_page_access(agent, &page, PermissionLevel::Read)?;
        Ok(AgentWorkspacePageView {
            page_id: page.id.clone(),
            title: page.title.clone(),
            folder_id: page.folder_id.clone(),
            text: page_to_text(&page),
            last_edited_at: page.last_edited_at.clone(),
            last_edited_by: page.last_edited_by.clone(),
        })
    }

    pub fn search(
        &self,
        agent: &AgentContext,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SearchResult>, String> {
        self.ensure_agent_folder(agent)?;
        let accessible = self.accessible_folder_ids(agent)?;
        let results = self.storage.search(query)?;
        Ok(results
            .into_iter()
            .filter(|result| accessible.contains(&result.folder_id))
            .take(limit)
            .collect())
    }

    pub fn create_page(
        &self,
        agent: &AgentContext,
        title: &str,
        content: Option<&str>,
    ) -> Result<WorkspacePage, String> {
        self.ensure_agent_folder(agent)?;
        let folder_id = Self::agent_folder_id(&agent.id);
        let page = self.storage.create_page(
            &CreatePageRequest {
                folder_id,
                title: title.to_string(),
            },
            &agent.name,
        )?;
        if let Some(body) = content.filter(|text| !text.trim().is_empty()) {
            return self.append_to_page(agent, &page.id, "Notes", &[body.to_string()]);
        }
        Ok(page)
    }

    pub fn append_journal(
        &self,
        agent: &AgentContext,
        journal_title: &str,
        heading: &str,
        lines: &[String],
    ) -> Result<WorkspacePage, String> {
        self.ensure_agent_folder(agent)?;
        let folder_id = Self::agent_folder_id(&agent.id);
        let page = self.storage.append_journal_entry(
            &folder_id,
            journal_title,
            heading,
            lines,
            &agent.name,
        )?;
        Ok(page)
    }

    pub fn append_to_page(
        &self,
        agent: &AgentContext,
        page_id: &str,
        heading: &str,
        lines: &[String],
    ) -> Result<WorkspacePage, String> {
        let page = self.storage.get_page(page_id)?;
        self.assert_page_access(agent, &page, PermissionLevel::Append)?;
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
        self.storage.update_page(&UpdatePageRequest {
            page_id: page_id.to_string(),
            title: None,
            blocks: Some(blocks),
            rich_doc: None,
            linked_entities: None,
            last_edited_by: Some(agent.name.clone()),
        })
    }

    pub fn write_deliverable(
        &self,
        agent: &AgentContext,
        title: &str,
        content: &str,
    ) -> Result<WorkspacePage, String> {
        self.ensure_agent_folder(agent)?;
        let folder_id = Self::agent_folder_id(&agent.id);
        let lines: Vec<String> = content
            .lines()
            .map(|line| line.to_string())
            .collect();
        let heading = format!("Deliverable · {title}");
        self.storage.append_journal_entry(&folder_id, title, &heading, &lines, &agent.name)
    }

    pub fn write_meeting_notes(
        &self,
        day_number: u32,
        meeting_id: &str,
        meeting_type: &str,
        messages: &[(String, String)],
        participants: &[(String, String, String)],
    ) -> Result<Vec<WorkspacePage>, String> {
        if let Some(existing) = self.storage.find_page_linked_to_meeting(meeting_id)? {
            return Ok(vec![existing]);
        }

        let mut created = Vec::new();
        let participant_names: Vec<&str> = participants
            .iter()
            .map(|(_, name, _)| name.as_str())
            .collect();

        let company_page = self.storage.create_page(
            &CreatePageRequest {
                folder_id: "folder-projects".to_string(),
                title: format!("Meeting Notes — {meeting_type}"),
            },
            "meeting-system",
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
        for (agent_id, name, _) in participants {
            company_links.push(LinkedEntity {
                entity_type: "agent".to_string(),
                id: agent_id.clone(),
                title: name.clone(),
            });
        }

        let company_updated = self.storage.update_page(&UpdatePageRequest {
            page_id: company_page.id.clone(),
            title: None,
            blocks: Some(blocks),
            rich_doc: None,
            linked_entities: Some(company_links),
            last_edited_by: Some("meeting-system".to_string()),
        })?;
        created.push(company_updated);

        for (agent_id, name, department) in participants {
            let agent = AgentContext {
                id: agent_id.clone(),
                name: name.clone(),
                department: department.clone(),
            };
            self.ensure_agent_folder(&agent)?;

            let journal_title = format!("{name} — Meeting Journal");
            let heading = format!("{meeting_type} Reflection");
            let mut lines = vec![format!(
                "Participants: {}",
                participant_names.join(", ")
            )];
            for (speaker, content) in messages {
                if speaker == name {
                    lines.push(format!("You: {content}"));
                } else {
                    lines.push(format!("{speaker}: {content}"));
                }
            }
            lines.push("Action items: follow up in next sprint planning.".to_string());

            let page = self.append_journal(&agent, &journal_title, &heading, &lines)?;
            let linked = self.storage.link_entity_to_page(
                &page.id,
                LinkedEntity {
                    entity_type: "meeting".to_string(),
                    id: meeting_id.to_string(),
                    title: format!("{meeting_type} meeting"),
                },
                &agent.name,
            )?;
            let linked = self.storage.link_entity_to_page(
                &linked.id,
                LinkedEntity {
                    entity_type: "agent".to_string(),
                    id: agent_id.clone(),
                    title: name.clone(),
                },
                &agent.name,
            )?;
            created.push(linked);
        }

        let feed_summary = format!(
            "{meeting_type} with {} participants — {} messages captured in workspace.",
            participants.len(),
            messages.len()
        );
        if let Ok(feed_page) = self
            .storage
            .append_company_feed_entry(day_number, &format!("Meeting — {meeting_type}"), &feed_summary)
        {
            created.push(feed_page);
        }

        Ok(created)
    }

    pub fn get_context(&self, agent: &AgentContext) -> Result<AgentWorkspaceContext, String> {
        self.ensure_agent_folder(agent)?;
        let folder = self.list_folder(agent)?;
        let recent_edits = self.list_activity_for_agent(agent, 8)?;
        Ok(AgentWorkspaceContext {
            agent_id: agent.id.clone(),
            agent_name: agent.name.clone(),
            folder_id: folder.folder_id,
            pages: folder.pages,
            files: folder.files,
            recent_edits,
        })
    }

    pub fn list_activity_for_agent(
        &self,
        agent: &AgentContext,
        limit: usize,
    ) -> Result<Vec<AgentWorkspaceActivityEntry>, String> {
        self.ensure_agent_folder(agent)?;
        let summaries = self.storage.list_summaries()?.pages;
        let mut entries: Vec<AgentWorkspaceActivityEntry> = summaries
            .into_iter()
            .filter(|page| page.last_edited_by == agent.name)
            .map(|page| AgentWorkspaceActivityEntry {
                agent_id: agent.id.clone(),
                agent_name: agent.name.clone(),
                page_id: page.id,
                title: page.title,
                folder_id: page.folder_id,
                last_edited_at: page.last_edited_at,
                action: "edited".to_string(),
            })
            .collect();
        entries.sort_by(|left, right| right.last_edited_at.cmp(&left.last_edited_at));
        entries.truncate(limit);
        Ok(entries)
    }

    pub fn list_company_activity(
        &self,
        agents: &[AgentContext],
        limit: usize,
    ) -> Result<Vec<AgentWorkspaceActivityEntry>, String> {
        let names: HashSet<&str> = agents.iter().map(|agent| agent.name.as_str()).collect();
        let id_by_name: std::collections::HashMap<&str, &str> = agents
            .iter()
            .map(|agent| (agent.name.as_str(), agent.id.as_str()))
            .collect();
        let summaries = self.storage.list_summaries()?.pages;
        let mut entries: Vec<AgentWorkspaceActivityEntry> = summaries
            .into_iter()
            .filter(|page| names.contains(page.last_edited_by.as_str()))
            .filter_map(|page| {
                let agent_id = id_by_name.get(page.last_edited_by.as_str())?.to_string();
                Some(AgentWorkspaceActivityEntry {
                    agent_id,
                    agent_name: page.last_edited_by.clone(),
                    page_id: page.id,
                    title: page.title,
                    folder_id: page.folder_id,
                    last_edited_at: page.last_edited_at,
                    action: "edited".to_string(),
                })
            })
            .collect();
        entries.sort_by(|left, right| right.last_edited_at.cmp(&left.last_edited_at));
        entries.truncate(limit);
        Ok(entries)
    }

    fn accessible_folder_ids(&self, agent: &AgentContext) -> Result<HashSet<String>, String> {
        let mut ids = HashSet::new();
        ids.insert(Self::agent_folder_id(&agent.id));
        ids.insert(department_folder_id(&agent.department));
        ids.insert("folder-projects".to_string());
        ids.insert("folder-company".to_string());

        let folders = self.storage.list_snapshot()?.folders;
        let mut changed = true;
        while changed {
            changed = false;
            for folder in &folders {
                if ids.contains(&folder.id) {
                    continue;
                }
                if let Some(parent_id) = folder.parent_id.as_deref() {
                    if ids.contains(parent_id) {
                        ids.insert(folder.id.clone());
                        changed = true;
                    }
                }
            }
        }
        Ok(ids)
    }

    fn folder_permission(&self, agent: &AgentContext, folder_id: &str) -> Option<PermissionLevel> {
        if folder_id == Self::agent_folder_id(&agent.id) {
            return Some(PermissionLevel::Write);
        }
        if folder_id == department_folder_id(&agent.department) {
            return Some(PermissionLevel::Read);
        }
        if folder_id == "folder-projects" {
            return Some(PermissionLevel::Append);
        }
        if folder_id == "folder-company" {
            return Some(PermissionLevel::Read);
        }

        let folders = self.storage.list_snapshot().ok()?.folders;
        let folder = folders.iter().find(|entry| entry.id == folder_id)?;
        match folder.workspace_type {
            WorkspaceType::Agent => None,
            WorkspaceType::Custom => folder
                .parent_id
                .as_deref()
                .and_then(|parent_id| self.folder_permission(agent, parent_id)),
            WorkspaceType::Department => {
                if folder_id == department_folder_id(&agent.department) {
                    Some(PermissionLevel::Read)
                } else {
                    Some(PermissionLevel::Read)
                }
            }
            WorkspaceType::Company => Some(PermissionLevel::Read),
            WorkspaceType::User => None,
        }
    }

    fn assert_page_access(
        &self,
        agent: &AgentContext,
        page: &WorkspacePage,
        required: PermissionLevel,
    ) -> Result<(), String> {
        if self
            .folder_permission(agent, &page.folder_id)
            .map(|level| level.satisfies(required))
            .unwrap_or(false)
        {
            return Ok(());
        }
        if required == PermissionLevel::Read
            && page
                .linked_entities
                .iter()
                .any(|link| link.entity_type == "agent" && link.id == agent.id)
        {
            return Ok(());
        }
        Err(format!(
            "Agent {} cannot access page \"{}\".",
            agent.name, page.title
        ))
    }
}

pub fn page_to_text(page: &WorkspacePage) -> String {
    let block_text = page
        .blocks
        .iter()
        .map(|block| block.content.as_str())
        .filter(|line| !line.is_empty() && *line != "Start writing...")
        .collect::<Vec<_>>()
        .join("\n");
    if block_text.is_empty() {
        page_index_body(page)
    } else {
        block_text
    }
}

pub fn format_workspace_context_for_prompt(context: &AgentWorkspaceContext) -> String {
    let mut lines = vec![
        format!(
            "Agent workspace folder: {} ({} pages, {} files)",
            context.folder_id,
            context.pages.len(),
            context.files.len()
        ),
    ];
    for page in context.pages.iter().take(8) {
        lines.push(format!("- {} [{}]", page.title, page.id));
    }
    if !context.recent_edits.is_empty() {
        lines.push("Recent edits:".to_string());
        for entry in context.recent_edits.iter().take(5) {
            lines.push(format!("- {} ({})", entry.title, entry.last_edited_at));
        }
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::models::CreatePageRequest;

    fn temp_storage() -> (std::path::PathBuf, WorkspaceStorage) {
        let root = std::env::temp_dir().join(format!(
            "soulcorp-agent-ws-{}",
            uuid::Uuid::new_v4()
        ));
        let storage = WorkspaceStorage::new(root.clone()).expect("workspace");
        storage.ensure_seed().expect("seed");
        (root, storage)
    }

    fn sample_agent() -> AgentContext {
        AgentContext {
            id: "agent-alpha".to_string(),
            name: "Alpha".to_string(),
            department: "Engineering".to_string(),
        }
    }

    fn other_agent() -> AgentContext {
        AgentContext {
            id: "agent-beta".to_string(),
            name: "Beta".to_string(),
            department: "Marketing".to_string(),
        }
    }

    #[test]
    fn agent_can_write_own_folder() {
        let (_root, storage) = temp_storage();
        let service = AgentWorkspaceService::new(&storage);
        let agent = sample_agent();
        service.ensure_agent_folder(&agent).expect("folder");
        let page = service
            .create_page(&agent, "Private Notes", Some("hello"))
            .expect("create");
        assert!(page.folder_id.contains("agent-alpha"));
    }

    #[test]
    fn agent_cannot_read_other_agent_private_page() {
        let (_root, storage) = temp_storage();
        let service = AgentWorkspaceService::new(&storage);
        let owner = sample_agent();
        let intruder = other_agent();
        service.ensure_agent_folder(&owner).expect("owner folder");
        let page = service
            .create_page(&owner, "Secret", Some("classified"))
            .expect("create");
        let err = service.read_page(&intruder, &page.id).unwrap_err();
        assert!(err.contains("cannot access"));
    }

    #[test]
    fn write_meeting_notes_creates_project_page_and_agent_journals() {
        let (_root, storage) = temp_storage();
        let service = AgentWorkspaceService::new(&storage);
        let agent = sample_agent();
        service.ensure_agent_folder(&agent).expect("folder");

        let pages = service
            .write_meeting_notes(
                3,
                "meet-42",
                "Daily Standup",
                &[
                    ("Alpha".to_string(), "Shipped the API layer.".to_string()),
                    ("Beta".to_string(), "Blocked on design review.".to_string()),
                ],
                &[(
                    agent.id.clone(),
                    agent.name.clone(),
                    agent.department.clone(),
                )],
            )
            .expect("meeting notes");

        assert!(!pages.is_empty());
        let project_page = pages
            .iter()
            .find(|page| page.folder_id == "folder-projects")
            .expect("project transcript");
        assert!(project_page.title.contains("Daily Standup"));
        assert!(project_page
            .linked_entities
            .iter()
            .any(|link| link.entity_type == "meeting" && link.id == "meet-42"));

        let again = service
            .write_meeting_notes(3, "meet-42", "Daily Standup", &[], &[])
            .expect("idempotent");
        assert_eq!(again.len(), 1);
        assert_eq!(again[0].id, project_page.id);
    }

    #[test]
    fn agent_search_is_scoped_to_accessible_folders() {
        let (_root, storage) = temp_storage();
        let service = AgentWorkspaceService::new(&storage);
        let agent = sample_agent();
        service
            .write_deliverable(&agent, "Engineering Roadmap", "Q3 platform migration")
            .expect("deliverable");
        storage
            .create_page(
                &CreatePageRequest {
                    folder_id: "folder-company".to_string(),
                    title: "Company Roadmap".to_string(),
                },
                "player",
            )
            .expect("company page");
        let results = service
            .search(&agent, "roadmap", 10)
            .expect("search");
        assert!(!results.is_empty());
        assert!(results.iter().all(|result| {
            result.folder_id.contains("agent-alpha")
                || result.folder_id == "folder-company"
                || result.folder_id == "folder-projects"
                || result.folder_id == "folder-dept-engineering"
        }));
    }
}