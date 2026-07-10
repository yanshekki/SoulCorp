//! Per-agent working memory (`memory.md`) — append during work, compress periodically.

use super::agent_service::{page_to_text, AgentContext, AgentWorkspaceService};
use super::models::{Block, CreatePageRequest, UpdatePageRequest};
use super::storage::WorkspaceStorage;
use crate::ai::provider::ChatRequest;
use crate::ai::{self, BilledChatRequest};
use crate::state::{AgentRecord, AppState};
use chrono::Utc;
use serde::Serialize;
use uuid::Uuid;

pub const MEMORY_PAGE_TITLE: &str = "memory.md";

const DEFAULT_MEMORY_TEMPLATE: &str = r#"# Working memory

## Current focus
- (none yet)

## Project facts
- (none yet)

## Decisions
- (none yet)

## Open loops
- (none yet)

## Recent
- Memory initialized.
"#;

#[derive(Debug, Clone, Serialize)]
pub struct AgentMemoryView {
    pub agent_id: String,
    pub page_id: Option<String>,
    pub text: String,
    pub chars: usize,
    pub updated_at: Option<String>,
    pub tasks_since_compress: u32,
    pub last_compressed_at: Option<String>,
}

fn default_memory_body(agent_name: &str) -> String {
    format!(
        "{DEFAULT_MEMORY_TEMPLATE}\n_Agent: {agent_name} · ready for work._\n"
    )
}

pub fn ensure_memory_page(
    storage: &WorkspaceStorage,
    agent: &AgentContext,
) -> Result<super::models::WorkspacePage, String> {
    // Call storage directly — do not go through AgentWorkspaceService::ensure_agent_folder
    // (that helper also ensures memory and would recurse).
    storage.ensure_agent_folder(&agent.id, &agent.name, &agent.department)?;
    let folder_id = AgentWorkspaceService::agent_folder_id(&agent.id);
    if let Some(existing) = storage.find_page_in_folder(&folder_id, MEMORY_PAGE_TITLE)? {
        return Ok(existing);
    }
    let page = storage.create_page(
        &CreatePageRequest {
            folder_id,
            title: MEMORY_PAGE_TITLE.to_string(),
        },
        &agent.name,
    )?;
    let body = default_memory_body(&agent.name);
    write_memory_text(storage, &page.id, &body, &agent.name)
}

pub fn read_memory_text(
    storage: &WorkspaceStorage,
    agent: &AgentContext,
) -> Result<(String, Option<String>, Option<String>), String> {
    let page = ensure_memory_page(storage, agent)?;
    let text = page_to_text(&page);
    Ok((text, Some(page.id), Some(page.last_edited_at)))
}

fn write_memory_text(
    storage: &WorkspaceStorage,
    page_id: &str,
    text: &str,
    editor: &str,
) -> Result<super::models::WorkspacePage, String> {
    let mut blocks = Vec::new();
    for line in text.lines() {
        let content = line.to_string();
        let block_type = if content.starts_with("# ") {
            "heading"
        } else if content.starts_with("## ") {
            "heading"
        } else {
            "text"
        };
        blocks.push(Block {
            id: Uuid::new_v4().to_string(),
            block_type: block_type.to_string(),
            content,
            checked: None,
        });
    }
    if blocks.is_empty() {
        blocks.push(Block {
            id: Uuid::new_v4().to_string(),
            block_type: "text".to_string(),
            content: text.to_string(),
            checked: None,
        });
    }
    storage.update_page(&UpdatePageRequest {
        page_id: page_id.to_string(),
        title: Some(MEMORY_PAGE_TITLE.to_string()),
        blocks: Some(blocks),
        rich_doc: None,
        linked_entities: None,
        last_edited_by: Some(editor.to_string()),
    })
}

pub fn append_task_memory_note(
    storage: &WorkspaceStorage,
    agent: &AgentContext,
    task_title: &str,
    summary: &str,
) -> Result<(), String> {
    let page = ensure_memory_page(storage, agent)?;
    let mut text = page_to_text(&page);
    let stamp = Utc::now().format("%Y-%m-%d %H:%M UTC");
    let note = format!(
        "\n### Task · {task_title} ({stamp})\n- {}\n",
        truncate_chars(summary.trim(), 400)
    );
    text.push_str(&note);
    write_memory_text(storage, &page.id, &text, &agent.name)?;
    Ok(())
}

pub fn memory_view_for_agent(
    state: &AppState,
    storage: &WorkspaceStorage,
    agent_id: &str,
) -> Result<AgentMemoryView, String> {
    let agent = state
        .agents
        .get(agent_id)
        .ok_or_else(|| format!("Agent {agent_id} not found."))?;
    let agent_ctx = AgentContext::from_record(agent);
    let (text, page_id, updated_at) = read_memory_text(storage, &agent_ctx)?;
    let tasks_since = state
        .agent_memory_tasks_since_compress
        .get(agent_id)
        .copied()
        .unwrap_or(0);
    let last_compressed = state
        .agent_memory_last_compressed_at
        .get(agent_id)
        .cloned();
    Ok(AgentMemoryView {
        agent_id: agent_id.to_string(),
        page_id,
        chars: text.chars().count(),
        text,
        updated_at,
        tasks_since_compress: tasks_since,
        last_compressed_at: last_compressed,
    })
}

pub fn prompt_memory_section(
    storage: Option<&WorkspaceStorage>,
    agent: &AgentRecord,
    max_chars: usize,
) -> String {
    let Some(storage) = storage else {
        return String::new();
    };
    let agent_ctx = AgentContext::from_record(agent);
    let Ok((text, _, _)) = read_memory_text(storage, &agent_ctx) else {
        return String::new();
    };
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let body = truncate_chars(trimmed, max_chars.max(500));
    format!("\n\n## Working memory (memory.md)\n{body}\n")
}

fn should_compress(state: &AppState, agent_id: &str, current_chars: usize) -> bool {
    let mode = state
        .settings
        .agent_memory_compress_mode
        .trim()
        .to_ascii_lowercase();
    let n = state.settings.agent_memory_compress_every_n_tasks.max(1);
    let max_chars = state.settings.agent_memory_max_chars.max(500) as usize;
    let since = state
        .agent_memory_tasks_since_compress
        .get(agent_id)
        .copied()
        .unwrap_or(0);

    match mode.as_str() {
        "every_task" => since >= 1,
        "every_n_tasks" => since >= n,
        "size_threshold" => current_chars > max_chars,
        // hybrid (default)
        _ => since >= n || current_chars > max_chars,
    }
}

/// After a successful task: optional append + maybe compress.
pub fn after_task_success(
    state: &mut AppState,
    storage: &WorkspaceStorage,
    agent: &AgentRecord,
    task_title: &str,
    summary: &str,
) {
    let agent_ctx = AgentContext::from_record(agent);
    if state.settings.agent_memory_append_after_task {
        if let Err(err) = append_task_memory_note(storage, &agent_ctx, task_title, summary) {
            eprintln!("agent memory append failed: {err}");
        }
    }

    let count = state
        .agent_memory_tasks_since_compress
        .entry(agent.id.clone())
        .or_insert(0);
    *count = count.saturating_add(1);

    let chars = read_memory_text(storage, &agent_ctx)
        .map(|(t, _, _)| t.chars().count())
        .unwrap_or(0);

    if should_compress(state, &agent.id, chars) {
        if let Err(err) = compress_agent_memory(state, storage, &agent.id) {
            eprintln!("agent memory compress failed: {err}");
        }
    }
}

pub fn compress_agent_memory(
    state: &mut AppState,
    storage: &WorkspaceStorage,
    agent_id: &str,
) -> Result<AgentMemoryView, String> {
    let agent = state
        .agents
        .get(agent_id)
        .cloned()
        .ok_or_else(|| format!("Agent {agent_id} not found."))?;
    let agent_ctx = AgentContext::from_record(&agent);
    let page = ensure_memory_page(storage, &agent_ctx)?;
    let current = page_to_text(&page);
    let compressed = rewrite_memory(state, &agent, &current)?;
    write_memory_text(storage, &page.id, &compressed, &agent.name)?;
    // note: rewrite_memory may mutate token ledger via billing
    state
        .agent_memory_tasks_since_compress
        .insert(agent_id.to_string(), 0);
    let now = Utc::now().to_rfc3339();
    state
        .agent_memory_last_compressed_at
        .insert(agent_id.to_string(), now);
    memory_view_for_agent(state, storage, agent_id)
}

pub fn reset_agent_memory(
    state: &mut AppState,
    storage: &WorkspaceStorage,
    agent_id: &str,
) -> Result<(), String> {
    let agent = state
        .agents
        .get(agent_id)
        .ok_or_else(|| format!("Agent {agent_id} not found."))?;
    let agent_ctx = AgentContext::from_record(agent);
    let page = ensure_memory_page(storage, &agent_ctx)?;
    let body = default_memory_body(&agent.name);
    write_memory_text(storage, &page.id, &body, "system")?;
    state.agent_memory_tasks_since_compress.insert(agent_id.to_string(), 0);
    state.agent_memory_last_compressed_at.remove(agent_id);
    Ok(())
}

fn rewrite_memory(
    state: &mut AppState,
    agent: &AgentRecord,
    current: &str,
) -> Result<String, String> {
    let max_chars = state.settings.agent_memory_max_chars.max(500) as usize;
    if state.settings.pure_local_mode || state.settings.ai_provider == "mock" {
        return Ok(template_compress(current, max_chars, &agent.name));
    }

    let user_prompt = format!(
        "Compress this agent working memory into a concise markdown document.\n\
Keep these sections: Current focus, Project facts, Decisions, Open loops, Recent.\n\
Preserve critical facts and decisions. Drop redundant task logs.\n\
Target under {max_chars} characters.\n\
Agent: {} ({})\n\n---\n{current}\n---\n\nReturn ONLY the rewritten markdown.",
        agent.name, agent.role
    );

    let request = ChatRequest {
        system_prompt: format!(
            "You maintain {}'s working memory for a simulated company. Be precise and structured.",
            agent.name
        ),
        context: None,
        user_prompt,
        temperature: 0.3,
        soul_id: agent.soul_id,
        conversation_turns: Vec::new(),
    };

    let department_providers = state.department_ai_providers.clone();
    let agent_override = agent.ai_provider.clone();
    match ai::chat_with_fallback_billed(
        state,
        BilledChatRequest {
            request,
            agent_id: agent.id.clone(),
            department: agent.department.clone(),
            source: "agent_memory_compress".into(),
        },
        &department_providers,
        agent_override.as_deref(),
    ) {
        Ok(response) => {
            let body = response.content.trim().to_string();
            if body.chars().count() < 40 {
                Ok(template_compress(current, max_chars, &agent.name))
            } else {
                Ok(body)
            }
        }
        Err(_) => Ok(template_compress(current, max_chars, &agent.name)),
    }
}

fn template_compress(current: &str, max_chars: usize, agent_name: &str) -> String {
    let recent: Vec<&str> = current
        .lines()
        .filter(|l| {
            let t = l.trim();
            t.starts_with("- ") || t.starts_with("### ")
        })
        .rev()
        .take(12)
        .collect();
    let mut recent = recent;
    recent.reverse();
    let recent_body = if recent.is_empty() {
        "- (compressed empty history)".to_string()
    } else {
        recent.join("\n")
    };
    let stamp = Utc::now().format("%Y-%m-%d %H:%M UTC");
    let draft = format!(
        "# Working memory\n\n## Current focus\n- Continue assigned sprint work\n\n## Project facts\n- See recent notes below\n\n## Decisions\n- (retained via compression at {stamp})\n\n## Open loops\n- Review Recent for unfinished items\n\n## Recent\n{recent_body}\n\n_Compressed for {agent_name} at {stamp}_\n"
    );
    truncate_chars(&draft, max_chars)
}

fn truncate_chars(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        text.to_string()
    } else {
        format!("{}…", text.chars().take(max.saturating_sub(1)).collect::<String>())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::storage::WorkspaceStorage;
    use std::fs;

    #[test]
    fn ensure_memory_creates_template_page() {
        let dir = std::env::temp_dir().join(format!("soulcorp-mem-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("mkdir");
        let storage = WorkspaceStorage::new(dir.clone()).expect("storage");
        storage.ensure_seed().expect("seed");
        let agent = AgentContext {
            id: "agent-test".into(),
            name: "Test Agent".into(),
            department: "Engineering".into(),
        };
        let page = ensure_memory_page(&storage, &agent).expect("memory page");
        assert_eq!(page.title, MEMORY_PAGE_TITLE);
        let text = page_to_text(&page);
        assert!(text.contains("Working memory"));
        // Idempotent
        let page2 = ensure_memory_page(&storage, &agent).expect("again");
        assert_eq!(page.id, page2.id);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn template_compress_keeps_structure() {
        let raw = "# Working memory\n\n## Recent\n- did A\n- did B\n### Task · Foo\n- bar\n";
        let out = template_compress(raw, 2000, "Mira");
        assert!(out.contains("Working memory"));
        assert!(out.contains("Current focus"));
        assert!(out.contains("Mira"));
    }
}
