//! Generate a full company department set from projects (LLM + heuristic fallback).

use super::{
    create_department_record, list_departments_snapshot, max_departments, normalize_hex_color,
    DepartmentsSnapshot,
};
use crate::ai::{self, provider::ChatRequest, BilledChatRequest};
use crate::fate::is_system_agent;
use crate::state::AppState;
use crate::token_budget::ensure_department_wallet;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

const COLOR_PALETTE: &[(&str, &str)] = &[
    ("#6d7f9b", "#5ec8ff"),
    ("#6d9b7f", "#7dffa0"),
    ("#9b7f6d", "#ffc85e"),
    ("#7f6d9b", "#c89bff"),
    ("#9b6d7f", "#ff8eb5"),
    ("#5e8a9b", "#6ed4e8"),
    ("#8a7a5e", "#e8c86e"),
    ("#5e9b8a", "#6ee8c8"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedDepartmentSpec {
    pub name: String,
    pub display_name: String,
    #[serde(default)]
    pub sop: String,
    #[serde(default)]
    pub brand_color: String,
    #[serde(default)]
    pub accent_color: String,
    #[serde(default)]
    pub parent_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LlmDepartmentPayload {
    departments: Vec<GeneratedDepartmentSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateDepartmentsResult {
    pub snapshot: DepartmentsSnapshot,
    pub created: Vec<String>,
    pub skipped_existing: Vec<String>,
    pub source: String,
    pub message: String,
}

pub fn build_generation_context(state: &AppState) -> String {
    let mut lines = Vec::new();
    lines.push(format!(
        "Company: {}",
        if state.company_name.trim().is_empty() {
            "(unnamed)"
        } else {
            state.company_name.trim()
        }
    ));

    lines.push(format!("Projects ({}):", state.projects.len()));
    if state.projects.is_empty() {
        lines.push("- (none yet)".into());
    } else {
        for project in state.projects.iter().take(20) {
            let desc = project.description.trim();
            let desc = if desc.len() > 160 {
                format!("{}…", &desc[..160])
            } else {
                desc.to_string()
            };
            lines.push(format!(
                "- {} | owner_dept={} | progress={:.0}% | {}",
                project.title,
                if project.owner_department.trim().is_empty() {
                    "?"
                } else {
                    project.owner_department.trim()
                },
                project.progress * 100.0,
                if desc.is_empty() { "(no description)" } else { &desc }
            ));
        }
    }

    let mut work_dept_counts: BTreeMap<String, u32> = BTreeMap::new();
    for node in &state.work_nodes {
        let dept = node.department.trim();
        if !dept.is_empty() {
            *work_dept_counts.entry(dept.to_string()).or_insert(0) += 1;
        }
    }
    if work_dept_counts.is_empty() {
        lines.push("Work-node department hints: (none)".into());
    } else {
        let hints: Vec<String> = work_dept_counts
            .iter()
            .map(|(name, count)| format!("{name} x{count}"))
            .collect();
        lines.push(format!("Work-node department hints: {}", hints.join(", ")));
    }

    lines.push("Agents (role → department string):".into());
    let mut agent_lines = 0u32;
    for agent in state.agents.values() {
        if is_system_agent(agent) {
            continue;
        }
        lines.push(format!(
            "- {} | {} | {}",
            agent.name, agent.role, agent.department
        ));
        agent_lines += 1;
        if agent_lines >= 24 {
            break;
        }
    }
    if agent_lines == 0 {
        lines.push("- (no agents)".into());
    }

    let existing: Vec<String> = state.departments.iter().map(|d| d.name.clone()).collect();
    if existing.is_empty() {
        lines.push("Existing formal departments: (none)".into());
    } else {
        lines.push(format!(
            "Existing formal departments: {}",
            existing.join(", ")
        ));
    }

    let remaining = max_departments().saturating_sub(state.departments.len());
    lines.push(format!(
        "Constraints: create up to {remaining} new departments (company max {}). Prefer 3–12 total useful teams. Cover project needs.",
        max_departments()
    ));

    lines.join("\n")
}

pub fn heuristic_department_specs(state: &AppState) -> Vec<GeneratedDepartmentSpec> {
    let mut names: BTreeSet<String> = BTreeSet::new();

    // Core baseline
    for core in ["Executive", "Engineering", "Human Resources"] {
        names.insert(core.to_string());
    }

    for project in &state.projects {
        let owner = project.owner_department.trim();
        if !owner.is_empty() {
            names.insert(title_case_dept(owner));
        }
        // Light keyword hints from title/description
        let blob = format!(
            "{} {}",
            project.title.to_lowercase(),
            project.description.to_lowercase()
        );
        if blob.contains("market") || blob.contains("growth") || blob.contains("brand") {
            names.insert("Marketing".into());
        }
        if blob.contains("sale") || blob.contains("revenue") || blob.contains("customer") {
            names.insert("Sales".into());
        }
        if blob.contains("design") || blob.contains("ui") || blob.contains("ux") {
            names.insert("Design".into());
        }
        if blob.contains("ops") || blob.contains("operation") || blob.contains("support") {
            names.insert("Operations".into());
        }
        if blob.contains("data") || blob.contains("ml") || blob.contains("ai research") {
            names.insert("Data".into());
        }
        if blob.contains("finance") || blob.contains("budget") || blob.contains("payroll") {
            names.insert("Finance".into());
        }
        if blob.contains("legal") || blob.contains("compliance") {
            names.insert("Legal".into());
        }
    }

    for node in &state.work_nodes {
        let dept = node.department.trim();
        if !dept.is_empty() {
            names.insert(title_case_dept(dept));
        }
    }

    for agent in state.agents.values() {
        if is_system_agent(agent) {
            continue;
        }
        let dept = agent.department.trim();
        if !dept.is_empty() {
            names.insert(title_case_dept(dept));
        }
    }

    // Remove ones that already exist formally
    names.retain(|name| {
        !state
            .departments
            .iter()
            .any(|d| d.name.eq_ignore_ascii_case(name))
    });

    let remaining = max_departments().saturating_sub(state.departments.len());
    names
        .into_iter()
        .take(remaining.min(12))
        .enumerate()
        .map(|(index, name)| {
            let (brand, accent) = COLOR_PALETTE[index % COLOR_PALETTE.len()];
            GeneratedDepartmentSpec {
                display_name: name.clone(),
                sop: default_sop_for(&name),
                brand_color: brand.to_string(),
                accent_color: accent.to_string(),
                parent_name: if name != "Executive" {
                    Some("Executive".into())
                } else {
                    None
                },
                name,
            }
        })
        .collect()
}

fn title_case_dept(raw: &str) -> String {
    raw.split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str().to_lowercase()),
                None => String::new(),
            }
        })
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn default_sop_for(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.contains("executive") {
        "Set company priorities, unblock departments, and own cross-team outcomes.".into()
    } else if lower.contains("engineer") || lower.contains("product") {
        "Ship reliable product work, protect quality, and document technical decisions.".into()
    } else if lower.contains("human") || lower.contains("hr") || lower.contains("people") {
        "Hire well, keep culture healthy, and run clear people processes.".into()
    } else if lower.contains("market") {
        "Drive awareness and demand with measurable campaigns and messaging.".into()
    } else if lower.contains("sale") {
        "Convert pipeline into revenue with clear ownership and follow-up.".into()
    } else if lower.contains("design") {
        "Deliver clear UX/UI, design systems, and product polish.".into()
    } else if lower.contains("operat") {
        "Keep delivery operations smooth, tracked, and escalated when blocked.".into()
    } else if lower.contains("financ") {
        "Track budgets, tokens/spend, and financial health of the company.".into()
    } else {
        format!("Own {name} outcomes for the company portfolio with clear SOPs and handoffs.")
    }
}

pub fn parse_llm_departments_json(raw: &str) -> Result<Vec<GeneratedDepartmentSpec>, String> {
    let trimmed = raw.trim();
    let json_slice = extract_json_object(trimmed).ok_or_else(|| {
        "LLM did not return a JSON object with a departments array.".to_string()
    })?;
    let payload: LlmDepartmentPayload =
        serde_json::from_str(json_slice).map_err(|e| format!("Invalid department JSON: {e}"))?;
    if payload.departments.is_empty() {
        return Err("LLM returned zero departments.".into());
    }
    Ok(payload.departments)
}

fn extract_json_object(raw: &str) -> Option<&str> {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```JSON")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let start = cleaned.find('{')?;
    let end = cleaned.rfind('}')?;
    if end <= start {
        return None;
    }
    Some(&cleaned[start..=end])
}

pub fn normalize_specs(
    specs: Vec<GeneratedDepartmentSpec>,
    state: &AppState,
) -> (Vec<GeneratedDepartmentSpec>, Vec<String>) {
    let remaining = max_departments().saturating_sub(state.departments.len());
    let mut skipped = Vec::new();
    let mut out = Vec::new();
    let mut seen: BTreeSet<String> = BTreeSet::new();

    for (index, mut spec) in specs.into_iter().enumerate() {
        let name = title_case_dept(spec.name.trim());
        if name.is_empty() {
            continue;
        }
        let key = name.to_lowercase();
        if seen.contains(&key)
            || state
                .departments
                .iter()
                .any(|d| d.name.eq_ignore_ascii_case(&name))
        {
            skipped.push(name);
            continue;
        }
        if out.len() >= remaining {
            skipped.push(name);
            continue;
        }
        seen.insert(key);
        let display = {
            let d = spec.display_name.trim();
            if d.is_empty() {
                name.clone()
            } else {
                d.to_string()
            }
        };
        // Always assign a palette pair, then allow valid LLM hex to override.
        let (default_brand, default_accent) = COLOR_PALETTE[index % COLOR_PALETTE.len()];
        spec.brand_color = normalize_hex_color(&spec.brand_color, default_brand);
        spec.accent_color = normalize_hex_color(&spec.accent_color, default_accent);
        // If LLM returned the same invalid junk twice, force distinct palette colors.
        if spec.brand_color == spec.accent_color {
            spec.brand_color = default_brand.to_string();
            spec.accent_color = default_accent.to_string();
        }
        if spec.sop.trim().is_empty() {
            spec.sop = default_sop_for(&name);
        }
        spec.name = name;
        spec.display_name = display;
        out.push(spec);
    }

    (out, skipped)
}

/// Apply normalized specs to state. Returns created names.
pub fn apply_department_specs(
    state: &mut AppState,
    specs: &[GeneratedDepartmentSpec],
) -> Vec<String> {
    let mut created = Vec::new();
    let mut name_to_id: BTreeMap<String, String> = state
        .departments
        .iter()
        .map(|d| (d.name.to_lowercase(), d.id.clone()))
        .collect();

    for spec in specs {
        if state.departments.len() >= max_departments() {
            break;
        }
        if state
            .departments
            .iter()
            .any(|d| d.name.eq_ignore_ascii_case(&spec.name))
        {
            continue;
        }
        let record = create_department_record(
            &spec.name,
            &spec.display_name,
            &spec.sop,
            &spec.brand_color,
            &spec.accent_color,
        );
        name_to_id.insert(spec.name.to_lowercase(), record.id.clone());
        ensure_department_wallet(&mut state.token_economy, &record.name);
        created.push(record.name.clone());
        state.departments.push(record);
    }

    // Parent pass
    for spec in specs {
        let Some(parent_name) = spec
            .parent_name
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        else {
            continue;
        };
        let Some(child_id) = name_to_id.get(&spec.name.to_lowercase()).cloned() else {
            continue;
        };
        let Some(parent_id) = name_to_id.get(&parent_name.to_lowercase()).cloned() else {
            continue;
        };
        if child_id == parent_id {
            continue;
        }
        if let Some(dept) = state.departments.iter_mut().find(|d| d.id == child_id) {
            dept.parent_department_id = Some(parent_id);
        }
    }

    created
}

pub fn system_prompt() -> &'static str {
    "You are an org-design advisor for an AI company simulator. \
     Given the company's projects and roster hints, propose a practical department structure. \
     Return ONLY valid JSON (no markdown) shaped as:\n\
     {\"departments\":[{\"name\":\"Engineering\",\"display_name\":\"Engineering\",\"sop\":\"…\",\
     \"brand_color\":\"#6d7f9b\",\"accent_color\":\"#5ec8ff\",\"parent_name\":\"Executive\"}]}\n\
     Rules: 3–12 departments; unique short names; include Executive when missing; \
     cover project needs; parent_name optional (must match another name or null); \
     SOP one short paragraph; ALWAYS set brand_color and accent_color as distinct #RRGGBB hex \
     (never empty, never named colors)."
}

/// Try LLM; on failure return None so caller can fall back to heuristic.
pub fn try_llm_department_specs(state: &mut AppState) -> Option<Vec<GeneratedDepartmentSpec>> {
    if state.settings.pure_local_mode || state.settings.ai_provider == "mock" {
        return None;
    }

    let context = build_generation_context(state);
    let (agent_id, department) = pick_billing_agent(state);
    let lang = crate::i18n::language_instruction(crate::i18n::language_from_settings(
        &state.settings,
    ));
    let request = ChatRequest {
        system_prompt: format!(
            "{}\n\n{lang}\nUse the company language for display_name and sop text. Keep JSON keys in English.",
            system_prompt()
        ),
        user_prompt: format!(
            "Design the company department structure from this context:\n\n{context}\n\nReturn JSON only."
        ),
        temperature: 0.4,
        soul_id: None,
        context: None,
        conversation_turns: Vec::new(),
    };

    let department_providers = state.department_ai_providers.clone();
    let response = ai::chat_with_fallback_billed(
        state,
        BilledChatRequest {
            request,
            agent_id,
            department,
            source: "generate_departments".into(),
        },
        &department_providers,
        None,
    )
    .ok()?;

    parse_llm_departments_json(&response.content).ok()
}

fn pick_billing_agent(state: &AppState) -> (String, String) {
    if let Some(agent) = state.agents.values().find(|a| {
        !is_system_agent(a)
            && (a.department.to_lowercase().contains("exec")
                || a.role.to_lowercase().contains("ceo")
                || a.role.to_lowercase().contains("coo")
                || a.role.to_lowercase().contains("pm"))
    }) {
        return (agent.id.clone(), agent.department.clone());
    }
    if let Some(agent) = state.agents.values().find(|a| !is_system_agent(a)) {
        return (agent.id.clone(), agent.department.clone());
    }
    ("system".into(), "Executive".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{AgentRecord, AppState, InternalProject};

    #[test]
    fn heuristic_includes_core_and_project_owner() {
        let mut state = AppState::default();
        state.projects.push(InternalProject {
            id: "p1".into(),
            title: "Growth app".into(),
            progress: 0.2,
            priority: 1,
            owner_department: "Marketing".into(),
            description: "Acquire customers with marketing campaigns.".into(),
            pm_agent_id: None,
            active_sprint_id: None,
            default_cycle_days: 14,
        });
        state.agents.insert(
            "a1".into(),
            AgentRecord {
                id: "a1".into(),
                name: "Kai".into(),
                role: "HR Lead".into(),
                department: "Human Resources".into(),
                morale: 0.8,
                energy: 0.8,
                salary: 3000.0,
                status: "idle".into(),
                soul: None,
                soul_id: None,
                ai_provider: None,
                agent_runtime_mode: None,
                agent_kind: None,
                skills: vec![],
                reports_to: None,
                manages_department: None,
            },
        );
        let specs = heuristic_department_specs(&state);
        let names: Vec<_> = specs.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"Executive"));
        assert!(names.contains(&"Engineering"));
        assert!(names.contains(&"Human Resources"));
        assert!(names.contains(&"Marketing"));
    }

    #[test]
    fn parse_llm_json_strips_fences() {
        let raw = r##"```json
{"departments":[{"name":"Engineering","display_name":"Engineering","sop":"Ship","brand_color":"#111111","accent_color":"#222222"}]}
```"##;
        let specs = parse_llm_departments_json(raw).expect("parse");
        assert_eq!(specs.len(), 1);
        assert_eq!(specs[0].name, "Engineering");
    }

    #[test]
    fn apply_creates_wallets_and_parents() {
        let mut state = AppState::default();
        let specs = vec![
            GeneratedDepartmentSpec {
                name: "Executive".into(),
                display_name: "Executive".into(),
                sop: "Lead".into(),
                brand_color: "#111111".into(),
                accent_color: "#222222".into(),
                parent_name: None,
            },
            GeneratedDepartmentSpec {
                name: "Engineering".into(),
                display_name: "Engineering".into(),
                sop: "Build".into(),
                brand_color: "#333333".into(),
                accent_color: "#444444".into(),
                parent_name: Some("Executive".into()),
            },
        ];
        let created = apply_department_specs(&mut state, &specs);
        assert_eq!(created.len(), 2);
        assert_eq!(state.departments.len(), 2);
        let eng = state
            .departments
            .iter()
            .find(|d| d.name == "Engineering")
            .unwrap();
        assert!(eng.parent_department_id.is_some());
        assert!(state.token_economy.departments.contains_key("Engineering"));
    }
}
