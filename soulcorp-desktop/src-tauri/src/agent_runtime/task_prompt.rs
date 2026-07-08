use crate::scrum::types::WorkNode;
use crate::state::AgentRecord;
use std::fs;
use std::path::{Path, PathBuf};

pub fn build_task_message(
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    soul_path: Option<&Path>,
    workspace_addon: Option<&str>,
) -> String {
    let acceptance = if task.acceptance_criteria.is_empty() {
        "- Meet the task objective with clear, actionable output.".to_string()
    } else {
        task.acceptance_criteria
            .iter()
            .map(|item| format!("- {item}"))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let soul_section = match agent.soul.as_ref() {
        Some(soul) if !soul.raw_content.trim().is_empty() => soul.raw_content.trim().to_string(),
        _ => "No soul profile defined.".to_string(),
    };

    let soul_file_note = soul_path
        .map(|path| format!("\nSoul file path: {}\n", path.display()))
        .unwrap_or_default();
    let workspace_section = workspace_addon
        .map(|body| format!("\n\n## Workspace context\n{body}\n"))
        .unwrap_or_default();

    format!(
        "# SoulCorp task execution\n\n## Agent\n- Name: {name}\n- Role: {role}\n- Department: {department}\n\n## Project\n{project_title}\n\n## Task\n**{title}**\n\n{description}\n\n## Acceptance criteria\n{acceptance}\n\n## Agent soul\n{soul_section}{soul_file_note}{workspace_section}\n## Instructions\nComplete this task using your available tools. Return the final deliverable as markdown plain text in your reply. Summarize files created and key decisions.",
        name = agent.name,
        role = agent.role,
        department = agent.department,
        title = task.title,
        description = if task.description.trim().is_empty() {
            "No additional details.".to_string()
        } else {
            task.description.clone()
        },
    )
}

pub fn build_compact_prompt(
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_addon: Option<&str>,
) -> String {
    let workspace_section = workspace_addon
        .map(|body| format!("\n\nWorkspace context:\n{body}"))
        .unwrap_or_default();
    format!(
        "Project: {project_title}\nAgent: {} ({})\nDepartment: {}\nTask: {}\nDetails: {}\nAcceptance:\n- {}{workspace_section}\n\nReturn the final deliverable as plain text/markdown.",
        agent.name,
        agent.role,
        agent.department,
        task.title,
        task.description,
        task.acceptance_criteria.join("\n- ")
    )
}

pub fn materialize_soul_file(
    temp_dir: &Path,
    agent: &AgentRecord,
    workspace_root: Option<&Path>,
) -> Result<Option<PathBuf>, String> {
    let Some(soul) = agent.soul.as_ref() else {
        return Ok(None);
    };
    if soul.raw_content.trim().is_empty() {
        return Ok(None);
    }

    if let Some(root) = workspace_root {
        let company_soul = root
            .join("agent-souls")
            .join(format!("{}.md", agent.id));
        if company_soul.exists() {
            return Ok(Some(company_soul));
        }
    }

    let path = temp_dir.join(format!("{}.soul.md", agent.id));
    fs::write(&path, &soul.raw_content).map_err(|e| e.to_string())?;
    Ok(Some(path))
}

pub fn resolve_agent_id(settings_default: &str, agent: &AgentRecord) -> String {
    if !settings_default.trim().is_empty() {
        return settings_default.trim().to_string();
    }

    let slug = agent
        .id
        .trim_start_matches("agent-")
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>();

    if slug.is_empty() {
        "main".to_string()
    } else {
        slug
    }
}