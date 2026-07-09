use crate::scrum::types::{WorkNode, WorkNodeKind};
use crate::state::AppState;
use crate::workspace::models::{Block, CreatePageRequest, UpdatePageRequest};
use crate::workspace::storage::{company_workspace_root, WorkspaceStorage};
use tauri::{AppHandle, Manager};

const PROJECTS_FOLDER_ID: &str = "folder-projects";

pub fn ensure_story_brief_pages(state: &mut AppState, app: &AppHandle) -> u32 {
    if state.company_id.is_empty() {
        return 0;
    }

    let stories: Vec<WorkNode> = state
        .work_nodes
        .iter()
        .filter(|n| {
            n.kind == WorkNodeKind::Story && n.linked_workspace_page_id.is_none()
        })
        .cloned()
        .collect();

    if stories.is_empty() {
        return 0;
    }

    let dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return 0,
    };
    let storage = match WorkspaceStorage::new(company_workspace_root(&dir, &state.company_id)) {
        Ok(s) => s,
        Err(_) => return 0,
    };
    if storage.ensure_seed().is_err() {
        return 0;
    }

    let mut created = 0u32;
    for story in stories {
        let criteria_text = if story.acceptance_criteria.is_empty() {
            "- Define measurable acceptance criteria.\n- Deliverable documented in Workspace.".to_string()
        } else {
            story
                .acceptance_criteria
                .iter()
                .map(|c| format!("- {c}"))
                .collect::<Vec<_>>()
                .join("\n")
        };

        let body = format!(
            "## Objective\n{}\n\n## Acceptance criteria\n{}\n\n## Owner department\n{}\n\n_Autopilot brief — edit freely; PM review reads the latest content._",
            if story.description.trim().is_empty() {
                story.title.clone()
            } else {
                story.description.clone()
            },
            criteria_text,
            story.department
        );

        let request = CreatePageRequest {
            title: format!("Brief — {}", story.title),
            folder_id: PROJECTS_FOLDER_ID.to_string(),
        };

        let page = match storage.create_page(&request, "autopilot") {
            Ok(p) => p,
            Err(_) => continue,
        };

        let blocks = vec![
            Block {
                id: uuid::Uuid::new_v4().to_string(),
                block_type: "text".to_string(),
                content: body.clone(),
                checked: None,
            },
        ];

        let _ = storage.update_page(&UpdatePageRequest {
            page_id: page.id.clone(),
            title: None,
            blocks: Some(blocks),
            rich_doc: None,
            last_edited_by: Some("autopilot".to_string()),
            linked_entities: None,
        });

        if let Some(node) = state.work_nodes.iter_mut().find(|n| n.id == story.id) {
            node.linked_workspace_page_id = Some(page.id);
            node.updated_at = crate::scrum::tree::now_iso();
        }
        created += 1;
    }

    created
}

pub fn extract_criteria_from_brief(
    app: &AppHandle,
    state: &AppState,
    page_id: &str,
) -> Vec<String> {
    if state.company_id.is_empty() {
        return Vec::new();
    }
    let dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return Vec::new(),
    };
    let storage = match WorkspaceStorage::new(company_workspace_root(&dir, &state.company_id)) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let page = match storage.get_page(page_id) {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };
    let text: String = page
        .blocks
        .iter()
        .map(|b| b.content.as_str())
        .collect::<Vec<_>>()
        .join("\n");

    text.lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with("- ") {
                Some(trimmed[2..].trim().to_string())
            } else {
                None
            }
        })
        .filter(|line| !line.is_empty())
        .collect()
}