//! LLM translation of stored documents (workspace pages, notes, deliverables).
//!
//! **Never holds `AppState` across network LLM calls** — long locks freeze the whole UI.

use super::{language_from_settings, parse_language, AppLanguage};
use crate::ai::provider::ChatRequest;
use crate::ai::{self, BilledChatRequest};
use crate::state::{AppState, GameSettings, HubState};
use crate::token_budget::{can_afford, charge_tokens, ChargeContext};
use crate::workspace::models::{Block, UpdatePageRequest, WorkspacePage};
use crate::workspace::page_to_text;
use crate::workspace::storage::WorkspaceStorage;
use std::collections::HashMap;
use uuid::Uuid;

const CHUNK_CHARS: usize = 7_000;

#[derive(Debug, Clone, serde::Serialize)]
pub struct TranslatedDocument {
    pub title: String,
    pub body: String,
    pub target_language: String,
}

/// Snapshot needed for LLM calls without holding AppState.
#[derive(Clone)]
pub struct TranslateRuntime {
    pub settings: GameSettings,
    pub hub: HubState,
    pub department_providers: HashMap<String, String>,
    pub agent_id: String,
    pub department: String,
    pub agent_override: Option<String>,
}

fn runtime_from_state(state: &AppState) -> TranslateRuntime {
    let agent_id = state
        .default_pm_agent_id
        .clone()
        .or_else(|| {
            state
                .agents
                .values()
                .find(|a| a.agent_kind.as_deref() != Some("fate"))
                .map(|a| a.id.clone())
        })
        .unwrap_or_else(|| "player".to_string());
    let department = state
        .agents
        .get(&agent_id)
        .map(|a| a.department.clone())
        .unwrap_or_else(|| "Executive".to_string());
    let agent_override = state
        .agents
        .get(&agent_id)
        .and_then(|a| a.ai_provider.clone());
    TranslateRuntime {
        settings: state.settings.clone(),
        hub: state.hub.clone(),
        department_providers: state.department_ai_providers.clone(),
        agent_id,
        department,
        agent_override,
    }
}

/// Translate free-form title + body. Caller must **not** hold AppState across this
/// if using the detached helpers; this entry still needs `&mut AppState` only for
/// afford checks + charging around each chunk (short locks if called carefully).
/// Prefer `translate_document_detached` from commands.
pub fn translate_document(
    state: &mut AppState,
    title: &str,
    body: &str,
    target: AppLanguage,
) -> Result<TranslatedDocument, String> {
    let runtime = runtime_from_state(state);
    // Afford a rough bound before network.
    if !state.settings.pure_local_mode {
        let _ = can_afford(state, &runtime.agent_id, 2_000);
    }
    let (doc, charges) = translate_document_with_runtime(&runtime, title, body, target)?;
    for charge in charges {
        let _ = charge_tokens(state, charge);
    }
    Ok(doc)
}

/// Fully detached translate — no AppState. Returns billing charges to apply under a short lock.
pub fn translate_document_with_runtime(
    runtime: &TranslateRuntime,
    title: &str,
    body: &str,
    target: AppLanguage,
) -> Result<(TranslatedDocument, Vec<ChargeContext>), String> {
    let title = title.trim();
    let body = body.trim();
    if title.is_empty() && body.is_empty() {
        return Err("Nothing to translate.".to_string());
    }

    let lang_name = target.english_name();
    let system = format!(
        "You are a professional document translator for a company OS.\n\
Target language: {lang_name} ({code}).\n\
Rules:\n\
- Translate all user-facing prose into the target language.\n\
- Keep code, file paths, IDs, URLs, and proper product names as-is when standard.\n\
- Preserve structure: paragraphs, headings (# / ##), bullet lists, numbering.\n\
- Do not add commentary, prefaces, or notes about the translation.\n\
- Output format exactly:\n\
TITLE: <translated title>\n\
---\n\
<body markdown or plain text>",
        code = target.code()
    );

    let mut charges = Vec::new();

    let (final_title, final_body) = if body.chars().count() <= CHUNK_CHARS {
        let (full, charge) = translate_chunk(
            runtime,
            &system,
            &format!("Translate this full document.\n\nTITLE: {title}\n\n{body}"),
        )?;
        if let Some(c) = charge {
            charges.push(c);
        }
        if let Some((t, b)) = parse_title_body(&full) {
            (
                if t.is_empty() {
                    title.to_string()
                } else {
                    t
                },
                b,
            )
        } else {
            (title.to_string(), strip_title_wrapper(&full))
        }
    } else {
        let (title_resp, charge) = translate_chunk(
            runtime,
            &system,
            &format!("Translate this document title only.\n\nTITLE: {title}\n---\n"),
        )?;
        if let Some(c) = charge {
            charges.push(c);
        }
        let translated_title = parse_title_body(&title_resp)
            .map(|(t, _)| t)
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| title.to_string());

        let mut parts = Vec::new();
        for (i, chunk) in chunk_text(body, CHUNK_CHARS).into_iter().enumerate() {
            let prompt = format!(
                "Translate document body part {} into {lang_name}.\n\
Return ONLY the translated body text (no TITLE line, no ---).\n\n{chunk}",
                i + 1
            );
            let (part, charge) = translate_chunk(runtime, &system, &prompt)?;
            if let Some(c) = charge {
                charges.push(c);
            }
            parts.push(strip_title_wrapper(&part));
        }
        (translated_title, parts.join("\n\n"))
    };

    Ok((
        TranslatedDocument {
            title: if final_title.is_empty() {
                title.to_string()
            } else {
                final_title
            },
            body: final_body,
            target_language: target.code().to_string(),
        },
        charges,
    ))
}

fn translate_chunk(
    runtime: &TranslateRuntime,
    system: &str,
    user_prompt: &str,
) -> Result<(String, Option<ChargeContext>), String> {
    let request = ChatRequest {
        system_prompt: system.to_string(),
        context: None,
        user_prompt: user_prompt.to_string(),
        temperature: 0.2,
        soul_id: None,
        conversation_turns: Vec::new(),
    };
    let (response, charge) = ai::chat_detached(
        &runtime.settings,
        &runtime.hub,
        &runtime.department_providers,
        BilledChatRequest {
            request,
            agent_id: runtime.agent_id.clone(),
            department: runtime.department.clone(),
            source: "content_translate".to_string(),
        },
        runtime.agent_override.as_deref(),
    )?;
    Ok((response.content.trim().to_string(), charge))
}

fn chunk_text(text: &str, max_chars: usize) -> Vec<String> {
    if text.chars().count() <= max_chars {
        return vec![text.to_string()];
    }
    let mut chunks = Vec::new();
    let mut current = String::new();
    for para in text.split("\n\n") {
        let candidate = if current.is_empty() {
            para.to_string()
        } else {
            format!("{current}\n\n{para}")
        };
        if candidate.chars().count() > max_chars && !current.is_empty() {
            chunks.push(current);
            current = para.to_string();
        } else {
            current = candidate;
        }
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    chunks
}

fn parse_title_body(raw: &str) -> Option<(String, String)> {
    let text = raw.trim();
    if let Some(rest) = text.strip_prefix("TITLE:") {
        let rest = rest.trim_start();
        if let Some((title_line, body)) = rest.split_once("\n---") {
            return Some((title_line.trim().to_string(), body.trim().to_string()));
        }
        if let Some((title_line, body)) = rest.split_once('\n') {
            return Some((title_line.trim().to_string(), body.trim().to_string()));
        }
        return Some((rest.trim().to_string(), String::new()));
    }
    None
}

fn strip_title_wrapper(raw: &str) -> String {
    if let Some((_, body)) = parse_title_body(raw) {
        if !body.is_empty() {
            return body;
        }
    }
    raw.trim()
        .lines()
        .filter(|l| !l.to_ascii_uppercase().starts_with("TITLE:"))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

/// Convert translated plain text into workspace blocks (headings + paragraphs).
pub fn text_to_blocks(body: &str) -> Vec<Block> {
    let mut blocks = Vec::new();
    for line in body.lines() {
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(rest) = trimmed
            .strip_prefix("### ")
            .or_else(|| trimmed.strip_prefix("## "))
            .or_else(|| trimmed.strip_prefix("# "))
        {
            blocks.push(Block {
                id: Uuid::new_v4().to_string(),
                block_type: "heading".to_string(),
                content: rest.trim().to_string(),
                checked: None,
            });
        } else if let Some(rest) = trimmed.strip_prefix("- [ ] ") {
            blocks.push(Block {
                id: Uuid::new_v4().to_string(),
                block_type: "todo".to_string(),
                content: rest.trim().to_string(),
                checked: Some(false),
            });
        } else if let Some(rest) = trimmed
            .strip_prefix("- [x] ")
            .or_else(|| trimmed.strip_prefix("- [X] "))
        {
            blocks.push(Block {
                id: Uuid::new_v4().to_string(),
                block_type: "todo".to_string(),
                content: rest.trim().to_string(),
                checked: Some(true),
            });
        } else {
            blocks.push(Block {
                id: Uuid::new_v4().to_string(),
                block_type: "text".to_string(),
                content: trimmed.to_string(),
                checked: None,
            });
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

/// Translate a workspace page without holding AppState during the LLM call.
/// `apply_charges` is called with each charge under a short external lock if needed.
pub fn translate_workspace_page_detached(
    storage: &WorkspaceStorage,
    runtime: &TranslateRuntime,
    page_id: &str,
    target: AppLanguage,
) -> Result<(WorkspacePage, Vec<ChargeContext>), String> {
    let page = storage.get_page(page_id)?;
    let body = page_to_text(&page);
    let (translated, charges) =
        translate_document_with_runtime(runtime, &page.title, &body, target)?;
    let blocks = text_to_blocks(&translated.body);
    let updated = storage.update_page(&UpdatePageRequest {
        page_id: page_id.to_string(),
        title: Some(translated.title),
        blocks: Some(blocks),
        rich_doc: None,
        last_edited_by: Some(format!("llm-translate:{}", target.code())),
        linked_entities: None,
    })?;
    Ok((updated, charges))
}

/// Translate a workspace page in place (short lock for billing only — prefer command path).
pub fn translate_workspace_page(
    state: &mut AppState,
    storage: &WorkspaceStorage,
    page_id: &str,
    target_raw: Option<&str>,
) -> Result<WorkspacePage, String> {
    let target = target_raw
        .map(parse_language)
        .unwrap_or_else(|| language_from_settings(&state.settings));
    let runtime = runtime_from_state(state);
    if !state.settings.pure_local_mode {
        can_afford(state, &runtime.agent_id, 2_000)?;
    }
    // Drop borrowing of state by only using runtime for LLM.
    let (page, charges) =
        translate_workspace_page_detached(storage, &runtime, page_id, target)?;
    for charge in charges {
        let _ = charge_tokens(state, charge);
    }
    Ok(page)
}

pub fn translate_workspace_pages_batch(
    state: &mut AppState,
    storage: &WorkspaceStorage,
    page_ids: &[String],
    target_raw: Option<&str>,
    max_pages: usize,
) -> Result<Vec<WorkspacePage>, String> {
    let mut out = Vec::new();
    for page_id in page_ids.iter().take(max_pages.max(1)) {
        match translate_workspace_page(state, storage, page_id, target_raw) {
            Ok(page) => out.push(page),
            Err(err) => {
                crate::app_log::log_global(
                    crate::app_log::LogLevel::Warn,
                    crate::app_log::LogCategory::Ai,
                    "content_translate",
                    format!("Failed to translate page {page_id}: {err}"),
                    None,
                );
            }
        }
    }
    if out.is_empty() && !page_ids.is_empty() {
        return Err("No pages could be translated.".to_string());
    }
    Ok(out)
}

/// Build runtime snapshot under a short lock (exported for commands).
pub fn snapshot_translate_runtime(state: &AppState) -> TranslateRuntime {
    runtime_from_state(state)
}

#[cfg(test)]
mod tests {
    use super::{parse_title_body, text_to_blocks};

    #[test]
    fn parses_envelope() {
        let (t, b) = parse_title_body("TITLE: Hello\n---\nBody line").unwrap();
        assert_eq!(t, "Hello");
        assert_eq!(b, "Body line");
    }

    #[test]
    fn blocks_from_markdownish() {
        let blocks = text_to_blocks("# Head\n\nParagraph\n\n- [ ] Todo");
        assert!(blocks.iter().any(|b| b.block_type == "heading"));
        assert!(blocks.iter().any(|b| b.block_type == "todo"));
    }
}
