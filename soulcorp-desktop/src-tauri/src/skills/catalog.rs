use super::security::SkillPolicy;
use super::types::{
    RiskTier, SkillCatalogView, SkillPack, SkillSource, SkillSummary, TokenCostClass, ToolParameterSpec,
    ToolSpec,
};
use std::collections::BTreeMap;
use std::sync::OnceLock;

const BUILTIN_SKILL_FILES: &[(&str, &str)] = &[
    (
        "workspace-research",
        include_str!("../../resources/skills/workspace-research/SKILL.md"),
    ),
    (
        "web-search",
        include_str!("../../resources/skills/web-search/SKILL.md"),
    ),
    (
        "fetch-and-summarize",
        include_str!("../../resources/skills/fetch-and-summarize/SKILL.md"),
    ),
    (
        "generate-image",
        include_str!("../../resources/skills/generate-image/SKILL.md"),
    ),
    (
        "edit-image",
        include_str!("../../resources/skills/edit-image/SKILL.md"),
    ),
    (
        "generate-audio",
        include_str!("../../resources/skills/generate-audio/SKILL.md"),
    ),
    (
        "generate-video",
        include_str!("../../resources/skills/generate-video/SKILL.md"),
    ),
    (
        "transcribe-media",
        include_str!("../../resources/skills/transcribe-media/SKILL.md"),
    ),
    (
        "diagram",
        include_str!("../../resources/skills/diagram/SKILL.md"),
    ),
    (
        "code-assist",
        include_str!("../../resources/skills/code-assist/SKILL.md"),
    ),
    (
        "code-sandbox",
        include_str!("../../resources/skills/code-sandbox/SKILL.md"),
    ),
    (
        "export-pack",
        include_str!("../../resources/skills/export-pack/SKILL.md"),
    ),
    (
        "meeting-prep",
        include_str!("../../resources/skills/meeting-prep/SKILL.md"),
    ),
    (
        "market-research",
        include_str!("../../resources/skills/market-research/SKILL.md"),
    ),
    (
        "draft-outreach",
        include_str!("../../resources/skills/draft-outreach/SKILL.md"),
    ),
    (
        "browser-assist",
        include_str!("../../resources/skills/browser-assist/SKILL.md"),
    ),
    (
        "web-comment",
        include_str!("../../resources/skills/web-comment/SKILL.md"),
    ),
    (
        "account-register",
        include_str!("../../resources/skills/account-register/SKILL.md"),
    ),
    (
        "post-to-x",
        include_str!("../../resources/skills/post-to-x/SKILL.md"),
    ),
    (
        "form-submit",
        include_str!("../../resources/skills/form-submit/SKILL.md"),
    ),
    (
        "script-runner",
        include_str!("../../resources/skills/script-runner/SKILL.md"),
    ),
];

static BUILTIN: OnceLock<Vec<SkillPack>> = OnceLock::new();

pub fn builtin_catalog() -> Vec<SkillPack> {
    BUILTIN
        .get_or_init(|| {
            BUILTIN_SKILL_FILES
                .iter()
                .filter_map(|(id, raw)| match parse_skill_md(raw, SkillSource::Builtin) {
                    Ok(pack) => Some(pack),
                    Err(err) => {
                        eprintln!("Failed to parse built-in skill {id}: {err}");
                        None
                    }
                })
                .collect()
        })
        .clone()
}

pub fn catalog_view(policy: &SkillPolicy) -> SkillCatalogView {
    catalog_view_with_packs(&builtin_catalog(), policy)
}

pub fn catalog_view_with_packs(packs: &[SkillPack], policy: &SkillPolicy) -> SkillCatalogView {
    let summaries: Vec<SkillSummary> = packs
        .iter()
        .map(|p| p.summary(policy.pack_enabled(p)))
        .collect();
    let mut by_category: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for s in &summaries {
        by_category
            .entry(s.category.clone())
            .or_default()
            .push(s.id.clone());
    }
    SkillCatalogView {
        version: 2,
        packs: summaries,
        by_category,
    }
}

/// Builtin + global + company custom packs.
pub fn full_catalog(app_data: &std::path::Path, workspace: Option<&std::path::Path>) -> Vec<SkillPack> {
    let mut packs = builtin_catalog();
    packs.extend(super::custom::load_dir(
        &super::custom::global_skills_root(app_data),
        SkillSource::Global,
    ));
    if let Some(ws) = workspace {
        packs.extend(super::custom::load_dir(
            &super::custom::company_skills_root(ws),
            SkillSource::Company,
        ));
    }
    packs
}

pub fn enabled_packs(policy: &SkillPolicy) -> Vec<SkillPack> {
    builtin_catalog()
        .into_iter()
        .filter(|p| policy.pack_enabled(p))
        .collect()
}

pub fn get_pack(id: &str) -> Option<SkillPack> {
    let key = id.trim().to_lowercase();
    builtin_catalog()
        .into_iter()
        .find(|p| p.id.eq_ignore_ascii_case(&key))
}

pub fn get_pack_from(packs: &[SkillPack], id: &str) -> Option<SkillPack> {
    let key = id.trim().to_lowercase();
    packs
        .iter()
        .find(|p| p.id.eq_ignore_ascii_case(&key))
        .cloned()
}

/// Minimal YAML frontmatter parser for SKILL.md (no external yaml crate).
pub fn parse_skill_md(raw: &str, source: SkillSource) -> Result<SkillPack, String> {
    let text = raw.trim_start_matches('\u{feff}');
    let rest = text
        .strip_prefix("---")
        .ok_or_else(|| "SKILL.md missing opening frontmatter ---".to_string())?
        .trim_start_matches(['\r', '\n']);
    let end = rest
        .find("\n---")
        .ok_or_else(|| "SKILL.md missing closing frontmatter ---".to_string())?;
    let front = &rest[..end];
    let body = rest[end + 4..].trim().to_string();

    let mut id = String::new();
    let mut name = String::new();
    let mut version = 1u32;
    let mut category = "general".to_string();
    let mut risk = RiskTier::Low;
    let mut requires_approval = false;
    let mut token_cost_class = TokenCostClass::Light;
    let mut permissions: Vec<String> = Vec::new();
    let mut when_to_use = String::new();
    let mut tools: Vec<ToolSpec> = Vec::new();
    let mut entry: Option<String> = None;
    let mut runtime: Option<String> = None;

    let mut lines = front.lines().peekable();
    while let Some(line) = lines.next() {
        let line = line.trim_end();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim();
            let value = value.trim().trim_matches('"');
            match key {
                "id" => id = value.to_string(),
                "name" => name = value.to_string(),
                "version" => version = value.parse().unwrap_or(1),
                "category" => category = value.to_string(),
                "risk" => risk = RiskTier::parse(value).unwrap_or(RiskTier::Low),
                "requires_approval" => {
                    requires_approval = value.eq_ignore_ascii_case("true") || value == "1"
                }
                "token_cost_class" => token_cost_class = TokenCostClass::parse(value),
                "entry" => {
                    if !value.is_empty() {
                        entry = Some(value.to_string());
                    }
                }
                "runtime" => {
                    if !value.is_empty() {
                        runtime = Some(value.to_string());
                    }
                }
                "when_to_use" => {
                    if value == "|" || value.is_empty() {
                        when_to_use = read_block(&mut lines);
                    } else {
                        when_to_use = value.to_string();
                    }
                }
                "permissions" => {
                    permissions = read_list_items(&mut lines);
                }
                "tools" => {
                    tools = read_tools(&mut lines);
                }
                _ => {}
            }
        }
    }

    if id.is_empty() {
        return Err("Skill frontmatter missing id".into());
    }
    if name.is_empty() {
        name = id.clone();
    }
    if when_to_use.is_empty() {
        when_to_use = format!("Use skill {id} when relevant to the task.");
    }

    Ok(SkillPack {
        id,
        name,
        version,
        category,
        risk,
        requires_approval,
        token_cost_class,
        permissions,
        tools,
        when_to_use,
        body,
        source,
        entry,
        runtime,
    })
}

fn read_block(lines: &mut std::iter::Peekable<std::str::Lines<'_>>) -> String {
    let mut out = Vec::new();
    while let Some(peek) = lines.peek() {
        let t = peek.trim_end();
        // Indented continuation or empty line inside block
        if t.is_empty() {
            out.push(String::new());
            lines.next();
            continue;
        }
        if !peek.starts_with(' ') && !peek.starts_with('\t') {
            break;
        }
        out.push(peek.trim().to_string());
        lines.next();
    }
    out.join(" ").trim().to_string()
}

fn read_list_items(lines: &mut std::iter::Peekable<std::str::Lines<'_>>) -> Vec<String> {
    let mut items = Vec::new();
    while let Some(peek) = lines.peek() {
        let trimmed = peek.trim();
        if let Some(rest) = trimmed.strip_prefix("- ") {
            // Stop if this looks like a tool object (id: under tools)
            if rest.starts_with("id:") {
                break;
            }
            items.push(rest.trim().to_string());
            lines.next();
        } else if trimmed.is_empty() {
            lines.next();
        } else if peek.starts_with(' ') || peek.starts_with('\t') {
            // nested under list — ignore for simple perms
            lines.next();
        } else {
            break;
        }
    }
    items
}

fn read_tools(lines: &mut std::iter::Peekable<std::str::Lines<'_>>) -> Vec<ToolSpec> {
    let mut tools = Vec::new();
    let mut current: Option<ToolSpec> = None;
    let mut in_parameters = false;

    while let Some(peek) = lines.peek().cloned() {
        let raw = peek;
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            lines.next();
            continue;
        }
        // New top-level key ends tools section
        if !raw.starts_with(' ') && !raw.starts_with('\t') && !trimmed.starts_with('-') {
            break;
        }

        if trimmed.starts_with("- id:") || trimmed.starts_with("-id:") {
            if let Some(tool) = current.take() {
                tools.push(tool);
            }
            let id = trimmed
                .split_once(':')
                .map(|(_, v)| v.trim().to_string())
                .unwrap_or_default();
            current = Some(ToolSpec {
                id,
                description: String::new(),
                parameters: Vec::new(),
            });
            in_parameters = false;
            lines.next();
            continue;
        }

        if let Some(tool) = current.as_mut() {
            if trimmed.starts_with("description:") {
                tool.description = trimmed
                    .split_once(':')
                    .map(|(_, v)| v.trim().to_string())
                    .unwrap_or_default();
                in_parameters = false;
            } else if trimmed.starts_with("parameters:") {
                in_parameters = true;
            } else if in_parameters {
                // "name: type" indented under parameters
                if let Some((name, kind)) = trimmed.split_once(':') {
                    let name = name.trim().to_string();
                    let kind = kind.trim().to_string();
                    if !name.is_empty() && name != "parameters" {
                        tool.parameters.push(ToolParameterSpec { name, kind });
                    }
                }
            }
        }
        lines.next();
    }
    if let Some(tool) = current {
        tools.push(tool);
    }
    tools
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skills::security::SkillPolicy;

    #[test]
    fn loads_at_least_16_builtin_packs() {
        let packs = builtin_catalog();
        assert!(
            packs.len() >= 16,
            "expected >=16 packs, got {}",
            packs.len()
        );
    }

    #[test]
    fn web_search_parses_tools() {
        let pack = get_pack("web-search").expect("web-search");
        assert_eq!(pack.risk, RiskTier::Low);
        assert!(pack.tools.iter().any(|t| t.id == "web_search"));
        assert!(!pack.when_to_use.is_empty());
        assert!(!pack.body.is_empty());
    }

    #[test]
    fn catalog_view_marks_critical_disabled() {
        let view = catalog_view(&SkillPolicy::default());
        let critical = view
            .packs
            .iter()
            .find(|p| p.id == "account-register")
            .expect("account-register");
        assert!(!critical.enabled);
        let research = view
            .packs
            .iter()
            .find(|p| p.id == "web-search")
            .expect("web-search");
        assert!(research.enabled);
    }
}
