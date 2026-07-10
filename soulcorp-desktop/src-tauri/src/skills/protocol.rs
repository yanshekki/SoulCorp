use super::types::AgentToolMessage;
use serde_json::Value;

/// Parse an LLM response into a tool protocol message.
/// Accepts pure JSON or fenced ```json blocks. Falls back to Final with raw text.
pub fn parse_agent_tool_message(raw: &str) -> AgentToolMessage {
    let trimmed = raw.trim();
    if let Some(json) = extract_json_object(trimmed) {
        if let Ok(msg) = serde_json::from_str::<AgentToolMessage>(&json) {
            return msg;
        }
        // Tolerate { "tool": "...", "args": {} } without type field.
        if let Ok(value) = serde_json::from_str::<Value>(&json) {
            if let Some(tool) = value.get("tool").and_then(|v| v.as_str()) {
                let args = value.get("args").cloned().unwrap_or(Value::Object(Default::default()));
                return AgentToolMessage::ToolCall {
                    tool: tool.to_string(),
                    args,
                };
            }
            if let Some(content) = value
                .get("content")
                .and_then(|v| v.as_str())
                .or_else(|| value.get("final").and_then(|v| v.as_str()))
            {
                return AgentToolMessage::Final {
                    content: content.to_string(),
                };
            }
        }
    }
    AgentToolMessage::Final {
        content: trimmed.to_string(),
    }
}

fn extract_json_object(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.starts_with('{') {
        return Some(trimmed.to_string());
    }
    // ```json ... ```
    if let Some(start) = trimmed.find("```") {
        let after = &trimmed[start + 3..];
        let after = after
            .strip_prefix("json")
            .or_else(|| after.strip_prefix("JSON"))
            .unwrap_or(after)
            .trim_start();
        if let Some(end) = after.find("```") {
            let block = after[..end].trim();
            if block.starts_with('{') {
                return Some(block.to_string());
            }
        }
    }
    // Find first { ... last }
    let start = trimmed.find('{')?;
    let end = trimmed.rfind('}')?;
    if end > start {
        Some(trimmed[start..=end].to_string())
    } else {
        None
    }
}

/// Short catalog prompt fragment for progressive disclosure.
pub fn format_skill_catalog_prompt(summaries: &[super::types::SkillSummary]) -> String {
    if summaries.is_empty() {
        return "No agent skills are enabled.".to_string();
    }
    let mut lines = vec![
        "Available skills (call tools by JSON {\"type\":\"tool_call\",\"tool\":\"<id>\",\"args\":{...}} or finish with {\"type\":\"final\",\"content\":\"...\"}):".to_string(),
    ];
    for s in summaries {
        if !s.enabled {
            continue;
        }
        lines.push(format!(
            "- {} [{}] risk={} tools=[{}]: {}",
            s.id,
            s.name,
            s.risk.as_str(),
            s.tool_ids.join(", "),
            s.when_to_use.replace('\n', " ").trim()
        ));
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_typed_tool_call() {
        let raw = r#"{"type":"tool_call","tool":"web_search","args":{"query":"rust"}}"#;
        match parse_agent_tool_message(raw) {
            AgentToolMessage::ToolCall { tool, args } => {
                assert_eq!(tool, "web_search");
                assert_eq!(args["query"], "rust");
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn parses_fenced_final() {
        let raw = "Here you go:\n```json\n{\"type\":\"final\",\"content\":\"Done\"}\n```\n";
        match parse_agent_tool_message(raw) {
            AgentToolMessage::Final { content } => assert_eq!(content, "Done"),
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn raw_text_becomes_final() {
        match parse_agent_tool_message("plain deliverable") {
            AgentToolMessage::Final { content } => assert!(content.contains("plain")),
            other => panic!("unexpected {other:?}"),
        }
    }
}
