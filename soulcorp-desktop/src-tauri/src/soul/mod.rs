mod hub_import;

pub use hub_import::{
    import_hub_soul, import_hub_soul_result, HubSoulImportResult, HubSoulRecord,
};

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// Agent persona stored on [`crate::state::AgentRecord::soul`].
///
/// Dual-track model:
/// - `raw_content` — user-visible SoulCorp soul.md (editor + workspace file).
/// - `system_prompt_source` — optional full hub-compiled prompt for AI; hidden from UI.
/// - Parsed sections — fallback when `system_prompt_source` is absent.
///
/// User edits via the editor clear hub-only fields (WYSIWYG: editor content drives AI).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoulProfile {
    pub name: String,
    pub personality: String,
    pub values: String,
    pub communication_style: String,
    pub raw_content: String,
    #[serde(default)]
    pub system_prompt_source: Option<String>,
    #[serde(default)]
    pub hub_file_type: Option<String>,
}

pub fn parse_soul_md(path: &str) -> Result<SoulProfile, String> {
    let content = fs::read_to_string(Path::new(path)).map_err(|e| e.to_string())?;
    parse_soul_content(&content)
}

/// Validates SoulCorp soul.md structure (mirrors frontend `validateSoulMd`).
pub fn validate_soul_content(content: &str) -> Result<(), String> {
    let trimmed = content.trim();
    if trimmed.len() < 8 {
        return Err("soul.md is too short.".to_string());
    }

    let title_line = trimmed
        .lines()
        .map(str::trim)
        .find(|line| line.starts_with("# ") && !line.starts_with("## "));
    let name = title_line
        .map(|line| line.trim_start_matches("# ").trim())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Add a title line starting with # Name.".to_string())?;
    if name.is_empty() {
        return Err("Agent name after # is required.".to_string());
    }

    for section in ["## Personality", "## Values", "## Communication Style"] {
        if !trimmed.contains(section) {
            return Err(format!("Missing section: {section}"));
        }
    }
    Ok(())
}

/// Parse soul.md from the editor; clears hub-only fields so AI matches the visible file.
pub fn soul_profile_from_editor_content(content: &str) -> Result<SoulProfile, String> {
    validate_soul_content(content)?;
    let mut profile = parse_soul_content(content)?;
    profile.system_prompt_source = None;
    profile.hub_file_type = None;
    Ok(profile)
}

/// Persona + task/meeting context for [`crate::ai::provider::ChatRequest`].
pub fn build_system_prompt_parts(profile: &SoulProfile, context: &str) -> (String, String) {
    let persona = if let Some(source) = profile
        .system_prompt_source
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        source.to_string()
    } else {
        format!(
            "You are {}, an AI employee in SoulCorp.\nPersonality: {}\nValues: {}\nCommunication Style: {}",
            profile.name, profile.personality, profile.values, profile.communication_style
        )
    };
    (persona, context.to_string())
}

pub fn build_chat_parts_for_agent(
    soul: Option<&SoulProfile>,
    name: &str,
    role: &str,
    department: &str,
    context: &str,
) -> (String, String) {
    if let Some(profile) = soul {
        build_system_prompt_parts(profile, context)
    } else {
        (
            format!("You are {name} ({role}) from {department} in SoulCorp."),
            context.to_string(),
        )
    }
}

pub fn parse_soul_content(content: &str) -> Result<SoulProfile, String> {
    let name = content
        .lines()
        .find(|line| line.starts_with("# "))
        .map(|line| line.trim_start_matches("# ").trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Unnamed Agent".to_string());

    Ok(SoulProfile {
        name: name.clone(),
        personality: extract_section(content, "Personality"),
        values: extract_section(content, "Values"),
        communication_style: extract_section(content, "Communication Style"),
        raw_content: content.to_string(),
        system_prompt_source: None,
        hub_file_type: None,
    })
}

fn extract_section(content: &str, heading: &str) -> String {
    let marker = format!("## {heading}");
    let start = content
        .find(&marker)
        .map(|index| index + marker.len())
        .unwrap_or(0);

    let remainder = &content[start..];
    let section = remainder.split("## ").next().unwrap_or(remainder).trim();

    if section.is_empty() {
        "Not specified.".to_string()
    } else {
        section.to_string()
    }
}

#[cfg(test)]
mod validation_tests {
    use super::*;

    #[test]
    fn validate_rejects_missing_sections() {
        let err = validate_soul_content("# X\n\n## Personality\nok").expect_err("missing sections");
        assert!(err.contains("Values"));
    }

    #[test]
    fn validate_accepts_canonical_soul() {
        let content = "# Mira\n\n## Personality\np\n\n## Values\nv\n\n## Communication Style\nc\n";
        validate_soul_content(content).expect("valid soul");
    }
}
