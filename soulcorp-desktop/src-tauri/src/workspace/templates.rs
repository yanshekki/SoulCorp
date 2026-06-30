use super::models::{Block, CreatePageRequest, WorkspacePage, WorkspaceTemplate};
use super::storage::WorkspaceStorage;
use serde_json::json;
use uuid::Uuid;

pub fn list_templates() -> Vec<WorkspaceTemplate> {
    vec![
        WorkspaceTemplate {
            id: "meeting_notes".to_string(),
            name: "Meeting Notes".to_string(),
            description: "Attendees, agenda, decisions, and action items.".to_string(),
            icon: Some("📝".to_string()),
        },
        WorkspaceTemplate {
            id: "project_brief".to_string(),
            name: "Project Brief".to_string(),
            description: "Goals, scope, milestones, and owners.".to_string(),
            icon: Some("📋".to_string()),
        },
        WorkspaceTemplate {
            id: "okr_tracker".to_string(),
            name: "OKR Tracker".to_string(),
            description: "Objectives, key results, and weekly confidence.".to_string(),
            icon: Some("🎯".to_string()),
        },
        WorkspaceTemplate {
            id: "client_report".to_string(),
            name: "Client Report".to_string(),
            description: "Executive summary, deliverables, and next steps.".to_string(),
            icon: Some("📊".to_string()),
        },
        WorkspaceTemplate {
            id: "post_mortem".to_string(),
            name: "Post-mortem".to_string(),
            description: "Timeline, root cause, and prevention actions.".to_string(),
            icon: Some("🔍".to_string()),
        },
    ]
}

pub fn create_page_from_template(
    storage: &WorkspaceStorage,
    template_id: &str,
    folder_id: &str,
    title: Option<&str>,
    editor: &str,
) -> Result<WorkspacePage, String> {
    let (page_title, blocks, rich_doc) = template_content(template_id, title)?;
    let mut page = storage.create_page(
        &CreatePageRequest {
            folder_id: folder_id.to_string(),
            title: page_title,
        },
        editor,
    )?;
    page = storage.update_page(&super::models::UpdatePageRequest {
        page_id: page.id.clone(),
        title: None,
        blocks: Some(blocks),
        rich_doc: Some(rich_doc),
        linked_entities: None,
        last_edited_by: Some(editor.to_string()),
    })?;
    Ok(page)
}

fn template_content(
    template_id: &str,
    title: Option<&str>,
) -> Result<(String, Vec<Block>, serde_json::Value), String> {
    let page_title = title
        .map(|value| value.to_string())
        .unwrap_or_else(|| default_title(template_id));

    let headings = match template_id {
        "meeting_notes" => vec![
            "Attendees",
            "Agenda",
            "Discussion",
            "Decisions",
            "Action Items",
        ],
        "project_brief" => vec![
            "Summary",
            "Goals",
            "Scope",
            "Milestones",
            "Risks",
        ],
        "okr_tracker" => vec![
            "Objective",
            "Key Results",
            "Owner",
            "Confidence",
        ],
        "client_report" => vec![
            "Executive Summary",
            "Deliverables",
            "Metrics",
            "Next Steps",
        ],
        "post_mortem" => vec![
            "Incident Summary",
            "Timeline",
            "Root Cause",
            "What Went Well",
            "Action Items",
        ],
        _ => return Err(format!("Unknown template: {template_id}")),
    };

    let mut blocks = Vec::new();
    let mut rich_content = Vec::new();

    for heading in headings {
        blocks.push(Block {
            id: Uuid::new_v4().to_string(),
            block_type: "heading".to_string(),
            content: heading.to_string(),
            checked: None,
        });
        blocks.push(Block {
            id: Uuid::new_v4().to_string(),
            block_type: "text".to_string(),
            content: String::new(),
            checked: None,
        });
        rich_content.push(json!({
            "type": "heading",
            "attrs": { "level": 2 },
            "content": [{ "type": "text", "text": heading }]
        }));
        rich_content.push(json!({
            "type": "paragraph",
            "content": []
        }));
    }

    let rich_doc = json!({
        "type": "doc",
        "content": rich_content
    });

    Ok((page_title, blocks, rich_doc))
}

fn default_title(template_id: &str) -> String {
    match template_id {
        "meeting_notes" => "Meeting Notes".to_string(),
        "project_brief" => "Project Brief".to_string(),
        "okr_tracker" => "OKR Tracker".to_string(),
        "client_report" => "Client Report".to_string(),
        "post_mortem" => "Post-mortem".to_string(),
        other => format!("{other} page"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_five_workspace_templates() {
        assert_eq!(list_templates().len(), 5);
    }

    #[test]
    fn meeting_notes_template_has_action_items_heading() {
        let (_, blocks, _) = template_content("meeting_notes", None).unwrap();
        assert!(blocks.iter().any(|block| block.content == "Action Items"));
    }
}