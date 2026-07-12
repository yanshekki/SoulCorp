//! Suggest search keywords for soul.md recruitment from company projects.

use crate::ai::{self, provider::ChatRequest, BilledChatRequest};
use crate::fate::is_system_agent;
use crate::lock_util::MutexExt;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestRecruitmentKeywordsRequest {
    #[serde(default)]
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestRecruitmentKeywordsResult {
    pub keywords: Vec<String>,
    pub focus_project_ids: Vec<String>,
    pub rationale: String,
    pub source: String,
}

#[derive(Debug, Deserialize)]
struct LlmKeywordsPayload {
    keywords: Vec<String>,
    #[serde(default)]
    rationale: String,
}

fn build_context(state: &AppState, project_id: Option<&str>) -> (String, Vec<String>) {
    let mut focus_ids = Vec::new();
    let mut lines = Vec::new();
    lines.push(format!(
        "Company: {}",
        if state.company_name.trim().is_empty() {
            "(unnamed)"
        } else {
            state.company_name.trim()
        }
    ));

    let projects: Vec<_> = state
        .projects
        .iter()
        .filter(|p| {
            project_id
                .map(|id| p.id == id)
                .unwrap_or(true)
        })
        .take(12)
        .collect();

    lines.push(format!("Projects ({}):", projects.len()));
    if projects.is_empty() {
        lines.push("- (none)".into());
    } else {
        for p in &projects {
            focus_ids.push(p.id.clone());
            let desc = p.description.trim();
            let desc = if desc.len() > 180 {
                format!("{}…", &desc[..180])
            } else {
                desc.to_string()
            };
            lines.push(format!(
                "- id={} | {} | dept={} | progress={:.0}% | {}",
                p.id,
                p.title,
                if p.owner_department.trim().is_empty() {
                    "?"
                } else {
                    p.owner_department.trim()
                },
                p.progress * 100.0,
                if desc.is_empty() {
                    "(no description)"
                } else {
                    &desc
                }
            ));
        }
    }

    let mut roles: BTreeSet<String> = BTreeSet::new();
    for agent in state.agents.values().filter(|a| !is_system_agent(a)).take(20) {
        if !agent.role.trim().is_empty() {
            roles.insert(agent.role.trim().to_string());
        }
    }
    if roles.is_empty() {
        lines.push("Existing roles: (none)".into());
    } else {
        lines.push(format!(
            "Existing roles (avoid exact duplicates unless needed): {}",
            roles.into_iter().take(12).collect::<Vec<_>>().join(", ")
        ));
    }

    // Work node hints for focused projects
    let mut node_hints = 0u32;
    for node in &state.work_nodes {
        if focus_ids.is_empty() || focus_ids.iter().any(|id| id == &node.project_id) {
            lines.push(format!(
                "- work: {} | dept={}",
                node.title,
                node.department
            ));
            node_hints += 1;
            if node_hints >= 10 {
                break;
            }
        }
    }

    lines.push(
        "Return 5–12 short search keywords for soulmd-hub soul.md listings \
         (skills, roles, domains). Prefer English tokens that match job tags."
            .into(),
    );

    (lines.join("\n"), focus_ids)
}

fn normalize_keywords(raw: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = BTreeSet::new();
    for kw in raw {
        let cleaned = kw
            .trim()
            .trim_matches(|c: char| c == '#' || c == ',' || c == ';')
            .to_lowercase();
        if cleaned.len() < 2 || cleaned.len() > 32 {
            continue;
        }
        if seen.insert(cleaned.clone()) {
            out.push(cleaned);
        }
        if out.len() >= 12 {
            break;
        }
    }
    out
}

pub fn heuristic_keywords(state: &AppState, project_id: Option<&str>) -> SuggestRecruitmentKeywordsResult {
    let mut keywords: BTreeSet<String> = BTreeSet::new();
    let mut focus_ids = Vec::new();

    let stop: BTreeSet<&str> = [
        "the", "and", "for", "with", "from", "this", "that", "into", "your", "our",
        "a", "an", "to", "of", "in", "on", "is", "are", "be", "as", "by", "or",
        "we", "it", "at", "will", "can", "need", "build", "make", "using",
    ]
    .into_iter()
    .collect();

    for project in state.projects.iter().filter(|p| {
        project_id.map(|id| p.id == id).unwrap_or(true)
    }) {
        focus_ids.push(project.id.clone());
        if !project.owner_department.trim().is_empty() {
            keywords.insert(project.owner_department.trim().to_lowercase());
        }
        let blob = format!("{} {}", project.title, project.description).to_lowercase();
        for token in blob.split(|c: char| !c.is_alphanumeric() && c != '-' && c != '_') {
            let t = token.trim();
            if t.len() < 3 || t.len() > 24 {
                continue;
            }
            if stop.contains(t) {
                continue;
            }
            keywords.insert(t.to_string());
        }
        // domain hints
        let lower = blob.as_str();
        if lower.contains("react") || lower.contains("frontend") || lower.contains("ui") {
            keywords.insert("react".into());
            keywords.insert("frontend".into());
        }
        if lower.contains("backend") || lower.contains("api") || lower.contains("rust") {
            keywords.insert("backend".into());
            keywords.insert("api".into());
        }
        if lower.contains("market") || lower.contains("growth") {
            keywords.insert("marketing".into());
        }
        if lower.contains("design") || lower.contains("ux") {
            keywords.insert("design".into());
            keywords.insert("ux".into());
        }
        if lower.contains("hr") || lower.contains("recruit") || lower.contains("people") {
            keywords.insert("hr".into());
            keywords.insert("people".into());
        }
        if lower.contains("data") || lower.contains("ml") || lower.contains("ai") {
            keywords.insert("ai".into());
            keywords.insert("data".into());
        }
    }

    if keywords.is_empty() {
        keywords.insert("engineering".into());
        keywords.insert("product".into());
        keywords.insert("generalist".into());
    }

    let list: Vec<String> = keywords.into_iter().take(10).collect();
    SuggestRecruitmentKeywordsResult {
        keywords: list,
        focus_project_ids: focus_ids,
        rationale: "Keywords extracted from project titles, descriptions, and owner departments."
            .into(),
        source: "heuristic".into(),
    }
}

fn try_llm_keywords(
    settings: &crate::state::GameSettings,
    hub: &crate::state::HubState,
    providers: &std::collections::HashMap<String, String>,
    context: &str,
    agent_id: String,
    department: String,
) -> Option<(Vec<String>, String)> {
    if settings.pure_local_mode || settings.ai_provider == "mock" {
        return None;
    }
    let lang = crate::i18n::language_instruction(crate::i18n::language_from_settings(settings));
    let request = ChatRequest {
        system_prompt: format!(
            "You help HR staff a company by suggesting soul.md hub search keywords. \
            Return ONLY JSON: {{\"keywords\":[\"token\",…],\"rationale\":\"one sentence\"}}. \
            5–12 short skill/role tokens. Prefer English tokens for hub search tags when the hub is English-tagged. \
            Write the rationale sentence in the company language.\n\n{lang}"
        ),
        user_prompt: format!(
            "Suggest recruitment search keywords from this company context:\n\n{context}"
        ),
        temperature: 0.4,
        soul_id: None,
        context: None,
        conversation_turns: Vec::new(),
    };
    let (response, _charge) = ai::chat_detached(
        settings,
        hub,
        providers,
        BilledChatRequest {
            request,
            agent_id,
            department,
            source: "recruitment_keywords".into(),
        },
        None,
    )
    .ok()?;

    let cleaned = response.content.trim();
    let start = cleaned.find('{')?;
    let end = cleaned.rfind('}')?;
    let payload: LlmKeywordsPayload = serde_json::from_str(&cleaned[start..=end]).ok()?;
    let keywords = normalize_keywords(payload.keywords);
    if keywords.is_empty() {
        return None;
    }
    Some((
        keywords,
        if payload.rationale.trim().is_empty() {
            "LLM keywords from project portfolio.".into()
        } else {
            payload.rationale.trim().to_string()
        },
    ))
}

#[tauri::command]
pub async fn suggest_recruitment_keywords_from_projects(
    request: SuggestRecruitmentKeywordsRequest,
    app: AppHandle,
) -> Result<SuggestRecruitmentKeywordsResult, String> {
    let progress = crate::progress::ProgressReporter::new(app.clone(), "recruitment_keywords");
    progress.emit_indeterminate(
        "Suggesting recruitment keywords from projects…",
        Some("llm"),
    );

    let project_id = request.project_id.clone();
    let app_clone = app.clone();

    let outcome = tokio::task::spawn_blocking(move || {
        let (heuristic, context, focus_ids, llm_pack) = {
            let state_mutex = app_clone.state::<Mutex<AppState>>();
            let state = state_mutex.lock_or_recover()?;
            let heuristic = heuristic_keywords(&state, project_id.as_deref());
            let (context, focus_ids) = build_context(&state, project_id.as_deref());
            let agent_id = state
                .agents
                .values()
                .find(|a| {
                    !is_system_agent(a)
                        && (a.role.to_lowercase().contains("hr")
                            || a.department.to_lowercase().contains("human"))
                })
                .or_else(|| state.agents.values().find(|a| !is_system_agent(a)))
                .map(|a| a.id.clone())
                .unwrap_or_else(|| "system".into());
            let department = state
                .agents
                .get(&agent_id)
                .map(|a| a.department.clone())
                .unwrap_or_else(|| "Human Resources".into());
            let settings = state.settings.clone();
            let hub = state.hub.clone();
            let providers = state.department_ai_providers.clone();
            (
                heuristic,
                context,
                focus_ids,
                (settings, hub, providers, agent_id, department),
            )
        }; // unlock

        let (settings, hub, providers, agent_id, department) = llm_pack;
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let out = try_llm_keywords(&settings, &hub, &providers, &context, agent_id, department);
            let _ = tx.send(out);
        });

        let result: SuggestRecruitmentKeywordsResult =
            match rx.recv_timeout(std::time::Duration::from_secs(15)) {
                Ok(Some((keywords, rationale))) => SuggestRecruitmentKeywordsResult {
                    keywords,
                    focus_project_ids: focus_ids,
                    rationale,
                    source: "llm".into(),
                },
                _ => heuristic,
            };
        Ok::<SuggestRecruitmentKeywordsResult, String>(result)
    })
    .await
    .map_err(|e| e.to_string())??;

    progress.finish(&format!(
        "Keywords ready ({}) · {}",
        outcome.source,
        outcome.keywords.join(", ")
    ));
    progress.clear();
    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{AppState, InternalProject};

    #[test]
    fn heuristic_pulls_tokens_from_project() {
        let mut state = AppState::default();
        state.projects.push(InternalProject {
            id: "p1".into(),
            title: "React dashboard for marketing analytics".into(),
            progress: 0.2,
            priority: 1,
            owner_department: "Engineering".into(),
            description: "Build frontend with React and API integrations.".into(),
            pm_agent_id: None,
            active_sprint_id: None,
            default_cycle_days: 14,
        });
        let result = heuristic_keywords(&state, None);
        assert!(result.keywords.iter().any(|k| k.contains("react") || k.contains("engineering")));
        assert!(!result.keywords.is_empty());
    }
}
