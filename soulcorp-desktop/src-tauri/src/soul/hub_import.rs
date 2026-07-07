use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::SoulProfile;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubSoulRecord {
    pub title: String,
    pub description: String,
    pub content: String,
    pub file_type: String,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub domain: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubSoulImportResult {
    pub display_md: String,
    pub system_prompt: String,
    pub file_type: String,
    pub description: String,
    pub name: String,
}

const PERSONALITY_MODULES: &[&str] = &["SOUL.md", "IDENTITY.md", "SOUL", "IDENTITY"];
const VALUES_MODULES: &[&str] = &["VALUES.md", "RULES.md", "VALUES", "RULES", "EXPERTISE.md"];
const STYLE_MODULES: &[&str] = &["STYLE.md", "STYLE", "VOICE.md", "COMMUNICATION.md"];

const PERSONALITY_HEADINGS: &[&str] = &[
    "Identity",
    "核心身份",
    "Personality",
    "身份",
    "Persona",
    "角色",
];
const VALUES_HEADINGS: &[&str] = &["Values", "Expertise", "Rules", "Hard Rules", "价值观", "专长"];
const STYLE_HEADINGS: &[&str] = &[
    "Output Style",
    "Voice",
    "Communication",
    "Communication Style",
    "语气",
    "語氣",
    "风格",
    "風格",
];

pub fn unescape_hub_text(content: &str) -> String {
    let mut text = content.to_string();
    if text.starts_with('"') && text.ends_with('"') {
        if let Ok(decoded) = serde_json::from_str::<String>(&text) {
            text = decoded;
        }
    }

    text.replace("\\r\\n", "\n")
        .replace("\\n", "\n")
        .replace("\\t", "\t")
        .replace("\\'", "'")
        .replace("\\\"", "\"")
}

pub fn detect_file_type(content: &str, file_type: &str) -> &'static str {
    if file_type == "full_soul_folder" || (file_type.is_empty() && content.trim().starts_with('{')) {
        "full_soul_folder"
    } else {
        "single_md"
    }
}

pub fn parse_modular_content(content: &str) -> Result<HashMap<String, String>, String> {
    let normalized = content.trim().replace("\\'", "'");
    let value: serde_json::Value =
        serde_json::from_str(&normalized).map_err(|error| format!("Failed to parse modular soul JSON: {error}"))?;
    let object = value
        .as_object()
        .ok_or_else(|| "Modular soul content must be a JSON object.".to_string())?;

    let mut modules = HashMap::new();
    for (filename, file_content) in object {
        let module_text = match file_content {
            serde_json::Value::String(text) => unescape_hub_text(text),
            other => other.to_string(),
        };
        modules.insert(filename.clone(), module_text);
    }
    Ok(modules)
}

pub fn compile_hub_system_prompt(file_type: &str, content: &str) -> String {
    match detect_file_type(content, file_type) {
        "full_soul_folder" => {
            let mut prompt = "Please adopt the following modular AI persona:\n\n".to_string();
            if let Ok(modules) = parse_modular_content(content) {
                let mut filenames: Vec<&String> = modules.keys().collect();
                filenames.sort();
                for filename in filenames {
                    if filename.contains("ERROR.md") {
                        continue;
                    }
                    if let Some(file_content) = modules.get(filename) {
                        prompt.push_str(&format!("=== MODULE: {filename} ===\n{file_content}\n\n"));
                    }
                }
            }
            prompt
        }
        _ => unescape_hub_text(content),
    }
}

fn module_by_names<'a>(modules: &'a HashMap<String, String>, names: &[&str]) -> Option<&'a str> {
    for target in names {
        for (filename, content) in modules {
            let normalized = filename.to_ascii_uppercase();
            let target_upper = target.to_ascii_uppercase();
            if (normalized == target_upper || normalized.contains(target_upper.trim_end_matches(".MD")))
                && !content.trim().is_empty()
            {
                return Some(content.as_str());
            }
        }
    }
    None
}

fn extract_section_from_md(content: &str, headings: &[&str]) -> Option<String> {
    let content = unescape_hub_text(content);
    for heading in headings {
        for marker in [format!("## {heading}"), format!("# {heading}")] {
            if let Some(start) = content.find(&marker) {
                let remainder = &content[start + marker.len()..];
                let section = remainder.split("\n## ").next().unwrap_or(remainder).trim();
                if !section.is_empty() {
                    return Some(section.to_string());
                }
            }
        }
    }

    for line in content.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("## ") {
            continue;
        }
        let heading_text = trimmed.trim_start_matches("## ").trim();
        if headings.iter().any(|heading| {
            heading_text.eq_ignore_ascii_case(heading)
                || heading_text.contains(heading)
                || heading.contains(heading_text)
        }) {
            if let Some(index) = content.find(line) {
                let remainder = &content[index + line.len()..];
                let section = remainder.split("\n## ").next().unwrap_or(remainder).trim();
                if !section.is_empty() {
                    return Some(section.to_string());
                }
            }
        }
    }

    None
}

fn section_from_sources(
    record: &HubSoulRecord,
    modules: Option<&HashMap<String, String>>,
    single_content: Option<&str>,
    module_names: &[&str],
    headings: &[&str],
    fallback: impl FnOnce(&HubSoulRecord) -> String,
) -> String {
    if let Some(mods) = modules {
        if let Some(module) = module_by_names(mods, module_names) {
            if let Some(section) = extract_section_from_md(module, headings) {
                return section;
            }
            let trimmed = module.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    if let Some(content) = single_content {
        if let Some(section) = extract_section_from_md(content, headings) {
            return section;
        }
    }

    fallback(record)
}

fn personality_fallback(record: &HubSoulRecord) -> String {
    let description = record.description.trim();
    if !description.is_empty() {
        return description.to_string();
    }
    record
        .role
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("A focused specialist from soulmd-hub.")
        .to_string()
}

fn values_fallback(record: &HubSoulRecord) -> String {
    if let Some(domain) = record.domain.as_deref().filter(|value| !value.trim().is_empty()) {
        return domain.to_string();
    }
    record
        .role
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("Collaboration, quality, clarity")
        .to_string()
}

fn communication_fallback(record: &HubSoulRecord) -> String {
    let role = record
        .role
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("their role");
    format!("Clear, professional communication suited to {role}.")
}

pub fn to_soulcorp_display_md(record: &HubSoulRecord) -> String {
    let file_type = detect_file_type(&record.content, &record.file_type);
    let name = record.title.trim();
    let name = if name.is_empty() {
        "Unnamed Agent".to_string()
    } else {
        name.to_string()
    };

    let (personality, values, communication) = if file_type == "full_soul_folder" {
        let modules = parse_modular_content(&record.content).unwrap_or_default();
        (
            section_from_sources(
                record,
                Some(&modules),
                None,
                PERSONALITY_MODULES,
                PERSONALITY_HEADINGS,
                personality_fallback,
            ),
            section_from_sources(
                record,
                Some(&modules),
                None,
                VALUES_MODULES,
                VALUES_HEADINGS,
                values_fallback,
            ),
            section_from_sources(
                record,
                Some(&modules),
                None,
                STYLE_MODULES,
                STYLE_HEADINGS,
                communication_fallback,
            ),
        )
    } else {
        let content = unescape_hub_text(&record.content);
        (
            section_from_sources(
                record,
                None,
                Some(&content),
                PERSONALITY_MODULES,
                PERSONALITY_HEADINGS,
                personality_fallback,
            ),
            section_from_sources(
                record,
                None,
                Some(&content),
                VALUES_MODULES,
                VALUES_HEADINGS,
                values_fallback,
            ),
            section_from_sources(
                record,
                None,
                Some(&content),
                STYLE_MODULES,
                STYLE_HEADINGS,
                communication_fallback,
            ),
        )
    };

    format!(
        "# {name}\n\n## Personality\n{personality}\n\n## Values\n{values}\n\n## Communication Style\n{communication}\n"
    )
}

pub fn import_hub_soul(record: HubSoulRecord) -> SoulProfile {
    let display_md = to_soulcorp_display_md(&record);
    let system_prompt = compile_hub_system_prompt(&record.file_type, &record.content);
    let file_type = detect_file_type(&record.content, &record.file_type).to_string();

    let mut profile = super::parse_soul_content(&display_md).unwrap_or(SoulProfile {
        name: record.title.clone(),
        personality: "Not specified.".to_string(),
        values: "Not specified.".to_string(),
        communication_style: "Not specified.".to_string(),
        raw_content: display_md.clone(),
        system_prompt_source: None,
        hub_file_type: None,
    });
    profile.raw_content = display_md;
    profile.system_prompt_source = Some(system_prompt);
    profile.hub_file_type = Some(file_type);
    profile
}

pub fn import_hub_soul_result(record: HubSoulRecord) -> HubSoulImportResult {
    let display_md = to_soulcorp_display_md(&record);
    let system_prompt = compile_hub_system_prompt(&record.file_type, &record.content);
    let name = super::parse_soul_content(&display_md)
        .map(|profile| profile.name)
        .unwrap_or_else(|_| record.title.clone());

    HubSoulImportResult {
        display_md,
        system_prompt,
        file_type: detect_file_type(&record.content, &record.file_type).to_string(),
        description: record.description.clone(),
        name,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn modular_record(content: &str) -> HubSoulRecord {
        HubSoulRecord {
            title: "Woody".to_string(),
            description: "A modular persona from soulmd-hub.".to_string(),
            content: content.to_string(),
            file_type: "full_soul_folder".to_string(),
            role: Some("Assistant".to_string()),
            domain: Some("Education".to_string()),
        }
    }

    #[test]
    fn unescapes_literal_newlines() {
        let text = "## 核心身份\\n我是 Woody\\n專注教學";
        let unescaped = unescape_hub_text(text);
        assert!(unescaped.contains('\n'));
        assert!(!unescaped.contains("\\n"));
    }

    #[test]
    fn modular_json_produces_clean_display_md() {
        let content = "{\"SOUL.md\": \"## 核心身份\\n我是 Woody，專注教學。\", \"STYLE.md\": \"## 語氣\\n友善直接。\", \"RULES.md\": \"## Hard Rules\\nNever guess.\"}";
        let result = import_hub_soul_result(modular_record(content));
        assert!(result.display_md.starts_with("# Woody"));
        assert!(result.display_md.contains("## Personality"));
        assert!(result.display_md.contains("我是 Woody"));
        assert!(result.display_md.contains("## Communication Style"));
        assert!(result.display_md.contains("友善直接"));
        assert!(!result.display_md.contains("SOUL.md"));
        assert!(!result.display_md.contains('{'));
    }

    #[test]
    fn modular_system_prompt_compiles_modules() {
        let content = "{\"SOUL.md\": \"## Identity\\nSenior dev\", \"STYLE.md\": \"## Voice\\nConcise\"}";
        let prompt = compile_hub_system_prompt("full_soul_folder", content);
        assert!(prompt.contains("=== MODULE: SOUL.md ==="));
        assert!(prompt.contains("Senior dev"));
        assert!(prompt.contains("=== MODULE: STYLE.md ==="));
    }

    #[test]
    fn single_md_maps_identity_sections() {
        let content = "## Identity\nYou are an expert translator.\n\n## Expertise\nLegal and medical docs.\n\n## Output Style\nConcise bilingual notes.";
        let record = HubSoulRecord {
            title: "Expert Translator".to_string(),
            description: "Translates documents contextually".to_string(),
            content: content.to_string(),
            file_type: "single_md".to_string(),
            role: Some("Translator".to_string()),
            domain: Some("Education".to_string()),
        };
        let result = import_hub_soul_result(record);
        assert!(result.display_md.contains("expert translator"));
        assert!(result.display_md.contains("Legal and medical"));
        assert!(result.display_md.contains("Concise bilingual"));
        assert_eq!(result.system_prompt, content);
        assert_eq!(result.file_type, "single_md");
    }

    #[test]
    fn import_hub_soul_sets_system_prompt_source() {
        let record = HubSoulRecord {
            title: "Dev Pack".to_string(),
            description: "Full-stack assistant".to_string(),
            content: "{\"SOUL.md\": \"## Identity\\nSenior developer\", \"RULES.md\": \"## Hard Rules\\nNo legacy code\"}"
                .to_string(),
            file_type: "full_soul_folder".to_string(),
            role: Some("Developer".to_string()),
            domain: None,
        };
        let profile = import_hub_soul(record);
        assert_eq!(profile.hub_file_type.as_deref(), Some("full_soul_folder"));
        assert!(profile
            .system_prompt_source
            .as_deref()
            .is_some_and(|value| value.contains("=== MODULE: SOUL.md ===")));
    }
}