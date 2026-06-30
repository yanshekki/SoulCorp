use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoulProfile {
    pub name: String,
    pub personality: String,
    pub values: String,
    pub communication_style: String,
    pub raw_content: String,
}

pub fn parse_soul_md(path: &str) -> Result<SoulProfile, String> {
    let content = fs::read_to_string(Path::new(path)).map_err(|e| e.to_string())?;
    parse_soul_content(&content)
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

pub fn build_system_prompt(profile: &SoulProfile, context: &str) -> String {
    format!(
        "You are {}, an AI employee in SoulCorp.\nPersonality: {}\nValues: {}\nCommunication Style: {}\nContext: {}",
        profile.name, profile.personality, profile.values, profile.communication_style, context
    )
}
