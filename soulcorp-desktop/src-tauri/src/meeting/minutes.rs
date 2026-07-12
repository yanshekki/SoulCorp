//! Structured meeting minutes: heuristic extract + optional short LLM polish.

use crate::ai::{self, provider::ChatRequest, BilledChatRequest};
use crate::state::{GameSettings, HubState};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MeetingMinutes {
    pub title: String,
    pub meeting_type: String,
    pub participants: Vec<String>,
    pub outcome_summary: String,
    #[serde(default)]
    pub key_points: Vec<String>,
    #[serde(default)]
    pub decisions: Vec<String>,
    #[serde(default)]
    pub action_items: Vec<String>,
    #[serde(default)]
    pub risks_blockers: Vec<String>,
    #[serde(default)]
    pub notes_write_error: Option<String>,
    /// Backlog task ids spawned from this meeting (for notes linking).
    #[serde(default)]
    pub task_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct LlmMinutesJson {
    #[serde(default)]
    summary: String,
    #[serde(default)]
    key_points: Vec<String>,
    #[serde(default)]
    decisions: Vec<String>,
    #[serde(default)]
    action_items: Vec<String>,
    #[serde(default)]
    risks: Vec<String>,
    #[serde(default)]
    risks_blockers: Vec<String>,
}

/// Build minutes from transcript. Pure heuristic (always works offline).
pub fn build_minutes_heuristic(
    meeting_type: &str,
    participant_names: &[String],
    transcript: &str,
    canned_outcome: &str,
    lang: crate::i18n::AppLanguage,
) -> MeetingMinutes {
    let action_items = extract_action_items(transcript);
    let key_points = extract_by_keywords(
        transcript,
        &[
            "priority",
            "focus",
            "key",
            "important",
            "重點",
            "優先",
            "主要",
            "summary",
            "update",
        ],
        6,
    );
    let decisions = extract_by_keywords(
        transcript,
        &[
            "decision",
            "decided",
            "agree",
            "agreed",
            "we will",
            "we'll",
            "決定",
            "決議",
            "同意",
            "拍板",
        ],
        6,
    );
    let risks_blockers = extract_by_keywords(
        transcript,
        &[
            "blocker",
            "blocked",
            "risk",
            "delay",
            "issue",
            "問題",
            "阻礙",
            "風險",
            "卡住",
        ],
        5,
    );

    let decided = crate::i18n::minutes_decided_next_actions(lang);
    let highlights = crate::i18n::minutes_highlights(lang);
    let from_disc = crate::i18n::minutes_from_discussion(lang);
    let outcome_summary = if !action_items.is_empty() {
        let bullets = action_items
            .iter()
            .take(4)
            .map(|i| format!("• {i}"))
            .collect::<Vec<_>>()
            .join("\n");
        format!("{canned_outcome}\n\n{decided}:\n{bullets}")
    } else if !key_points.is_empty() {
        format!(
            "{canned_outcome}\n\n{highlights}:\n{}",
            key_points
                .iter()
                .take(3)
                .map(|i| format!("• {i}"))
                .collect::<Vec<_>>()
                .join("\n")
        )
    } else {
        let last_bits: Vec<&str> = transcript
            .lines()
            .rev()
            .take(3)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        if last_bits.is_empty() {
            format!("{meeting_type}: {canned_outcome}")
        } else {
            format!(
                "{meeting_type}: {canned_outcome}\n\n{from_disc}:\n{}",
                last_bits.join("\n")
            )
        }
    };

    // Ensure key_points not empty if we have transcript content
    let key_points = if key_points.is_empty() {
        transcript
            .lines()
            .filter_map(|line| {
                let content = strip_speaker(line);
                if content.chars().count() >= 24 && content.chars().count() <= 200 {
                    Some(content)
                } else {
                    None
                }
            })
            .take(4)
            .collect()
    } else {
        key_points
    };

    MeetingMinutes {
        title: crate::i18n::minutes_title(lang, meeting_type),
        meeting_type: meeting_type.to_string(),
        participants: participant_names.to_vec(),
        outcome_summary,
        key_points,
        decisions,
        action_items,
        risks_blockers,
        notes_write_error: None,
        task_ids: Vec::new(),
    }
}

/// Detached polish without AppState lock (lightweight finalize step).
pub fn polish_minutes_detached(
    settings: &GameSettings,
    hub: &HubState,
    department_providers: &HashMap<String, String>,
    agent_override: Option<&str>,
    department: &str,
    transcript: &str,
    base: MeetingMinutes,
) -> MeetingMinutes {
    if settings.pure_local_mode || !ai::company_llm_credentials_ready(settings) {
        return base;
    }
    let truncated = truncate_chars(transcript, 6000);
    if truncated.trim().is_empty() {
        return base;
    }

    let app_lang = crate::i18n::language_from_settings(settings);
    let lang = crate::i18n::language_instruction(app_lang);
    let lang_req = match app_lang {
        crate::i18n::AppLanguage::En => {
            "All summary, key_points, decisions, action_items, risks_blockers MUST be English."
                .to_string()
        }
        crate::i18n::AppLanguage::ZhHant => {
            "所有 summary、key_points、decisions、action_items、risks_blockers 必須用繁體中文（專有名詞可保留英文）。"
                .to_string()
        }
        crate::i18n::AppLanguage::ZhHans => {
            "所有 summary、key_points、decisions、action_items、risks_blockers 必须用简体中文（专有名词可保留英文）。"
                .to_string()
        }
    };
    let prompt = format!(
        "You are a meeting secretary. From the transcript, produce ONLY valid JSON (no markdown fences) with keys:\n\
         summary (string, 1-3 sentences),\n\
         key_points (string array, 3-6 items),\n\
         decisions (string array),\n\
         action_items (string array),\n\
         risks_blockers (string array).\n\
         {lang_req}\n\
         Prefer company language over speaker language. Be concrete and short.\n\n\
         Meeting type: {}\nParticipants: {}\n\nTranscript:\n{truncated}",
        base.meeting_type,
        base.participants.join(", "),
    );

    let request = ChatRequest {
        system_prompt: format!("You extract structured meeting minutes as JSON only.\n\n{lang}"),
        context: None,
        user_prompt: format!("{lang}\n\n{prompt}"),
        temperature: 0.2,
        soul_id: None,
        conversation_turns: Vec::new(),
    };

    let billed = BilledChatRequest {
        request,
        agent_id: "meeting-minutes".into(),
        department: department.to_string(),
        source: "meeting_minutes".into(),
    };

    match ai::chat_detached(settings, hub, department_providers, billed, agent_override) {
        Ok((response, _charge)) => merge_llm_into_base(base, &response.content),
        Err(_) => base,
    }
}

fn merge_llm_into_base(mut base: MeetingMinutes, raw: &str) -> MeetingMinutes {
    let json_str = extract_json_object(raw).unwrap_or_else(|| raw.to_string());
    let Ok(parsed) = serde_json::from_str::<LlmMinutesJson>(&json_str) else {
        return base;
    };
    if !parsed.summary.trim().is_empty() {
        base.outcome_summary = parsed.summary.trim().to_string();
    }
    if !parsed.key_points.is_empty() {
        base.key_points = clean_list(parsed.key_points, 8);
    }
    if !parsed.decisions.is_empty() {
        base.decisions = clean_list(parsed.decisions, 8);
    }
    if !parsed.action_items.is_empty() {
        base.action_items = clean_list(parsed.action_items, 8);
    }
    let risks = if !parsed.risks_blockers.is_empty() {
        parsed.risks_blockers
    } else {
        parsed.risks
    };
    if !risks.is_empty() {
        base.risks_blockers = clean_list(risks, 6);
    }
    base
}

fn clean_list(items: Vec<String>, max: usize) -> Vec<String> {
    let mut out = Vec::new();
    for item in items {
        let t = item.trim().to_string();
        if t.chars().count() < 6 {
            continue;
        }
        if out.iter().any(|e: &String| e == &t) {
            continue;
        }
        out.push(t);
        if out.len() >= max {
            break;
        }
    }
    out
}

fn extract_json_object(raw: &str) -> Option<String> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if end <= start {
        return None;
    }
    Some(raw[start..=end].to_string())
}

pub fn extract_action_items(transcript: &str) -> Vec<String> {
    let mut items = Vec::new();
    for raw in transcript.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        let content = strip_speaker(line);
        let lower = content.to_lowercase();
        let looks_action = content.starts_with('-')
            || content.starts_with('*')
            || content.starts_with('•')
            || lower.contains("action")
            || lower.contains("todo")
            || lower.contains("next:")
            || lower.contains("i'll ")
            || lower.contains("i will ")
            || lower.contains("we will ")
            || lower.contains("need to ")
            || lower.contains("should ")
            || lower.contains("blocker")
            || lower.contains("focus:")
            || lower.contains("行動")
            || lower.contains("下一步")
            || lower.contains("跟進")
            || (content.contains("**")
                && (lower.contains("frontend")
                    || lower.contains("backend")
                    || lower.contains("qa")
                    || lower.contains("pm")));
        if !looks_action {
            continue;
        }
        let cleaned = content
            .trim_start_matches(['-', '*', '•', ' '])
            .trim()
            .to_string();
        if cleaned.chars().count() < 12 || cleaned.chars().count() > 220 {
            continue;
        }
        if items.iter().any(|e: &String| e == &cleaned) {
            continue;
        }
        items.push(cleaned);
        if items.len() >= 8 {
            break;
        }
    }
    if items.is_empty() {
        for raw in transcript.lines().rev().take(20) {
            let content = strip_speaker(raw);
            if content.starts_with('-') || content.starts_with('*') {
                let cleaned = content
                    .trim_start_matches(['-', '*', '•', ' '])
                    .trim()
                    .to_string();
                if cleaned.chars().count() >= 12 {
                    items.push(cleaned);
                }
            }
            if items.len() >= 4 {
                break;
            }
        }
        items.reverse();
    }
    items
}

fn extract_by_keywords(transcript: &str, keywords: &[&str], max: usize) -> Vec<String> {
    let mut items = Vec::new();
    for raw in transcript.lines() {
        let content = strip_speaker(raw);
        if content.chars().count() < 16 || content.chars().count() > 220 {
            continue;
        }
        let lower = content.to_lowercase();
        if !keywords.iter().any(|k| lower.contains(k)) {
            continue;
        }
        let cleaned = content
            .trim_start_matches(['-', '*', '•', ' '])
            .trim()
            .to_string();
        if items.iter().any(|e: &String| e == &cleaned) {
            continue;
        }
        items.push(cleaned);
        if items.len() >= max {
            break;
        }
    }
    items
}

fn strip_speaker(line: &str) -> String {
    line.split_once(':')
        .map(|(_, rest)| rest.trim().to_string())
        .unwrap_or_else(|| line.trim().to_string())
}

fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    s.chars().take(max).collect::<String>() + "\n…[truncated]"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_action_and_decision_lines() {
        let t = "\
Hudson: Our priority is shipping the vertical slice this week.\n\
CTO: Decision: we will use modular monolith.\n\
Hudson: Action: create access request template by Thursday.\n\
CTO: Blocker: missing vendor approval.\n";
        let m = build_minutes_heuristic(
            "Daily Standup",
            &["Hudson".into(), "CTO".into()],
            t,
            "Standup closed.",
            crate::i18n::AppLanguage::En,
        );
        assert!(!m.action_items.is_empty() || !m.key_points.is_empty());
        assert!(!m.outcome_summary.is_empty());
    }
}
