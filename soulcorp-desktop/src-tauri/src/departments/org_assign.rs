//! LLM + heuristic assignment of agents to departments and reporting lines.

use super::org_chart::{build_org_chart, OrgChartSnapshot};
use crate::ai::{self, provider::ChatRequest, BilledChatRequest};
use crate::fate::is_system_agent;
use crate::state::{AgentRecord, AppState};
use crate::token_budget::ensure_agent_wallet;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentOrgAssignment {
    pub agent_id: String,
    pub department: String,
    #[serde(default)]
    pub reports_to: Option<String>,
    #[serde(default)]
    pub manages_department: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LlmAssignPayload {
    assignments: Vec<AgentOrgAssignment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignOrgResult {
    pub updated: u32,
    pub heads: Vec<String>,
    pub source: String,
    pub message: String,
    pub snapshot: OrgChartSnapshot,
}

pub fn formal_department_names(state: &AppState) -> Vec<String> {
    let mut names: Vec<String> = state.departments.iter().map(|d| d.name.clone()).collect();
    names.sort();
    names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    names
}

pub fn resolve_formal_department(name: &str, formal: &[String]) -> Option<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return None;
    }
    formal
        .iter()
        .find(|d| d.eq_ignore_ascii_case(trimmed))
        .cloned()
}

pub fn build_assign_context(state: &AppState) -> String {
    let formal = formal_department_names(state);
    let mut lines = Vec::new();
    lines.push(format!(
        "Company: {}",
        if state.company_name.trim().is_empty() {
            "(unnamed)"
        } else {
            state.company_name.trim()
        }
    ));
    lines.push(format!(
        "Formal departments: {}",
        if formal.is_empty() {
            "(none — must use only empty)".to_string()
        } else {
            formal.join(", ")
        }
    ));

    lines.push("Agents:".into());
    for agent in state.agents.values().filter(|a| !is_system_agent(a)) {
        lines.push(format!(
            "- id={} | name={} | role={} | department={} | reports_to={} | manages={}",
            agent.id,
            agent.name,
            agent.role,
            agent.department,
            agent.reports_to.as_deref().unwrap_or("null"),
            agent.manages_department.as_deref().unwrap_or("null")
        ));
    }

    lines.push("Projects:".into());
    if state.projects.is_empty() {
        lines.push("- (none)".into());
    } else {
        for project in state.projects.iter().take(15) {
            lines.push(format!(
                "- {} | owner_dept={}",
                project.title,
                if project.owner_department.trim().is_empty() {
                    "?"
                } else {
                    project.owner_department.trim()
                }
            ));
        }
    }

    lines.push(
        "Assign every agent exactly once. department must be a formal department. \
         Prefer one head (manages_department) per department. \
         Tree must be acyclic; CEO/COO/Co-CEO as roots when possible."
            .into(),
    );
    lines.join("\n")
}

pub fn system_prompt() -> &'static str {
    "You are an org-design advisor. Assign each agent to a formal department, \
     a reports_to manager (agent id or null for top leaders), and optional manages_department. \
     Return ONLY valid JSON (no markdown):\n\
     {\"assignments\":[{\"agent_id\":\"…\",\"department\":\"Engineering\",\
     \"reports_to\":\"agent-id-or-null\",\"manages_department\":null}]}\n\
     Rules: every non-system agent once; department must match formal list; \
     role fit (engineer→Engineering, HR→Human Resources, marketing→Marketing, \
     CEO/COO/Co-CEO→Executive); one preferred head per department; no cycles; \
     reports_to must be another agent id or null."
}

pub fn parse_llm_assignments(raw: &str) -> Result<Vec<AgentOrgAssignment>, String> {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```JSON")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let start = cleaned
        .find('{')
        .ok_or_else(|| "LLM did not return JSON object.".to_string())?;
    let end = cleaned
        .rfind('}')
        .ok_or_else(|| "LLM JSON incomplete.".to_string())?;
    let payload: LlmAssignPayload = serde_json::from_str(&cleaned[start..=end])
        .map_err(|e| format!("Invalid org assignment JSON: {e}"))?;
    if payload.assignments.is_empty() {
        return Err("LLM returned zero assignments.".into());
    }
    Ok(payload.assignments)
}

fn role_suggested_department(role: &str, formal: &[String]) -> Option<String> {
    let r = role.to_lowercase();
    let candidates: &[(&str, &[&str])] = &[
        (
            "Executive",
            &[
                "ceo", "coo", "cfo", "cto", "co-ceo", "co ceo", "chief", "executive", "partner",
            ],
        ),
        (
            "Engineering",
            &[
                "engine", "developer", "dev", "backend", "frontend", "fullstack", "software",
                "tech", "architect", "sre", "devops",
            ],
        ),
        (
            "Human Resources",
            &["hr", "people", "talent", "recruit", "human resource"],
        ),
        (
            "Marketing",
            &["market", "growth", "brand", "content", "seo", "social"],
        ),
        ("Sales", &["sales", "account executive", "bd ", "business develop"]),
        ("Design", &["design", "ux", "ui", "product design"]),
        ("Operations", &["ops", "operation", "support", "customer success"]),
        ("Finance", &["finance", "accounting", "controller", "treasury"]),
        ("Data", &["data", "analyst", "ml ", "machine learning", "ai research"]),
        ("Legal", &["legal", "counsel", "compliance"]),
        ("Product", &["product manager", "pm ", "product owner"]),
    ];

    for (dept, keys) in candidates {
        if keys.iter().any(|k| r.contains(k)) {
            if let Some(resolved) = resolve_formal_department(dept, formal) {
                return Some(resolved);
            }
            // fuzzy: formal name contains keyword
            if let Some(found) = formal.iter().find(|f| {
                f.to_lowercase().contains(&dept.to_lowercase())
                    || dept.to_lowercase().contains(&f.to_lowercase())
            }) {
                return Some(found.clone());
            }
        }
    }
    None
}

fn is_leadership_role(role: &str) -> bool {
    let r = role.to_lowercase();
    r.contains("lead")
        || r.contains("head")
        || r.contains("director")
        || r.contains("manager")
        || r.contains("chief")
        || r.contains("ceo")
        || r.contains("coo")
        || r.contains("cto")
        || r.contains("cfo")
        || r.contains("co-ceo")
}

fn pick_root_id(agents: &[&AgentRecord]) -> Option<String> {
    let scored = |a: &AgentRecord| -> i32 {
        let r = a.role.to_lowercase();
        let mut score = 0;
        if r.contains("coo") {
            score += 50;
        }
        if r.contains("ceo") && !r.contains("co-ceo") {
            score += 40;
        }
        if r.contains("co-ceo") || r.contains("co ceo") {
            score += 45;
        }
        if a.department.to_lowercase().contains("exec") {
            score += 20;
        }
        if r.contains("partner") {
            score += 15;
        }
        score
    };
    agents
        .iter()
        .max_by_key(|a| scored(a))
        .map(|a| a.id.clone())
}

/// Full heuristic rewrite of department + reporting lines.
pub fn heuristic_assignments(state: &AppState) -> Result<Vec<AgentOrgAssignment>, String> {
    let formal = formal_department_names(state);
    if formal.is_empty() {
        return Err(
            "No formal departments yet. Use “Generate org with AI” on the Departments tab first."
                .into(),
        );
    }

    let agents: Vec<&AgentRecord> = state
        .agents
        .values()
        .filter(|a| !is_system_agent(a))
        .collect();
    if agents.is_empty() {
        return Err("No agents to assign.".into());
    }

    let default_dept = resolve_formal_department("Executive", &formal)
        .or_else(|| formal.first().cloned())
        .unwrap();

    // Step 1: department per agent
    let mut dept_by_agent: HashMap<String, String> = HashMap::new();
    for agent in &agents {
        let dept = role_suggested_department(&agent.role, &formal)
            .or_else(|| resolve_formal_department(&agent.department, &formal))
            .unwrap_or_else(|| default_dept.clone());
        dept_by_agent.insert(agent.id.clone(), dept);
    }

    // Step 2: one head per department
    let mut head_by_dept: HashMap<String, String> = HashMap::new();
    for dept in &formal {
        let mut candidates: Vec<&&AgentRecord> = agents
            .iter()
            .filter(|a| dept_by_agent.get(&a.id).map(|d| d == dept).unwrap_or(false))
            .collect();
        candidates.sort_by_key(|a| {
            let leadership = if is_leadership_role(&a.role) { 0 } else { 1 };
            (leadership, a.name.clone())
        });
        if let Some(head) = candidates.first() {
            head_by_dept.insert(dept.clone(), head.id.clone());
        }
    }

    let root_id = pick_root_id(&agents).unwrap_or_else(|| agents[0].id.clone());
    // Root manages Executive if possible
    let root_dept = dept_by_agent
        .get(&root_id)
        .cloned()
        .unwrap_or_else(|| default_dept.clone());

    let mut out = Vec::new();
    for agent in &agents {
        let department = dept_by_agent
            .get(&agent.id)
            .cloned()
            .unwrap_or_else(|| default_dept.clone());
        let is_root = agent.id == root_id;
        let is_dept_head = head_by_dept
            .get(&department)
            .map(|id| id == &agent.id)
            .unwrap_or(false);

        let reports_to = if is_root {
            None
        } else if is_dept_head {
            // Dept heads report to root (unless they are root)
            Some(root_id.clone())
        } else {
            // ICs report to dept head, else root
            head_by_dept
                .get(&department)
                .filter(|id| *id != &agent.id)
                .cloned()
                .or_else(|| Some(root_id.clone()))
        };

        let manages_department = if is_root {
            resolve_formal_department("Executive", &formal).or(Some(root_dept.clone()))
        } else if is_dept_head {
            Some(department.clone())
        } else {
            None
        };

        out.push(AgentOrgAssignment {
            agent_id: agent.id.clone(),
            department,
            reports_to,
            manages_department,
        });
    }

    Ok(out)
}

/// Validate and normalize assignments; drop invalid edges; ensure DAG.
pub fn sanitize_assignments(
    state: &AppState,
    raw: Vec<AgentOrgAssignment>,
) -> Result<Vec<AgentOrgAssignment>, String> {
    let formal = formal_department_names(state);
    if formal.is_empty() {
        return Err(
            "No formal departments yet. Use “Generate org with AI” on the Departments tab first."
                .into(),
        );
    }

    let agent_ids: HashSet<String> = state
        .agents
        .values()
        .filter(|a| !is_system_agent(a))
        .map(|a| a.id.clone())
        .collect();

    let mut by_id: BTreeMap<String, AgentOrgAssignment> = BTreeMap::new();
    for mut item in raw {
        if !agent_ids.contains(&item.agent_id) {
            continue;
        }
        let Some(dept) = resolve_formal_department(&item.department, &formal) else {
            continue;
        };
        item.department = dept;

        if let Some(mgr) = item.reports_to.as_ref() {
            if mgr == &item.agent_id || !agent_ids.contains(mgr) {
                item.reports_to = None;
            }
        }

        if let Some(manages) = item.manages_department.as_ref() {
            match resolve_formal_department(manages, &formal) {
                Some(d) => item.manages_department = Some(d),
                None => item.manages_department = None,
            }
        }

        by_id.insert(item.agent_id.clone(), item);
    }

    // Fill missing agents with current / heuristic dept only
    for id in &agent_ids {
        if by_id.contains_key(id) {
            continue;
        }
        if let Some(agent) = state.agents.get(id) {
            let dept = resolve_formal_department(&agent.department, &formal)
                .unwrap_or_else(|| formal[0].clone());
            by_id.insert(
                id.clone(),
                AgentOrgAssignment {
                    agent_id: id.clone(),
                    department: dept,
                    reports_to: None,
                    manages_department: None,
                },
            );
        }
    }

    // Break cycles: if edge creates cycle in assignment map, clear reports_to
    let ids: Vec<String> = by_id.keys().cloned().collect();
    for id in ids {
        let Some(mgr) = by_id.get(&id).and_then(|a| a.reports_to.clone()) else {
            continue;
        };
        if assignment_edge_creates_cycle(&by_id, &id, &mgr) {
            if let Some(a) = by_id.get_mut(&id) {
                a.reports_to = None;
            }
        }
    }

    // Prefer single head per department: keep first leadership by name
    let mut head_claimed: HashMap<String, String> = HashMap::new();
    let mut ordered: Vec<AgentOrgAssignment> = by_id.into_values().collect();
    ordered.sort_by(|a, b| a.agent_id.cmp(&b.agent_id));
    for item in &mut ordered {
        if let Some(dept) = item.manages_department.clone() {
            match head_claimed.get(&dept) {
                Some(existing) if existing != &item.agent_id => {
                    item.manages_department = None;
                }
                None => {
                    head_claimed.insert(dept, item.agent_id.clone());
                }
                _ => {}
            }
        }
    }

    Ok(ordered)
}

fn assignment_edge_creates_cycle(
    by_id: &BTreeMap<String, AgentOrgAssignment>,
    agent_id: &str,
    manager_id: &str,
) -> bool {
    if agent_id == manager_id {
        return true;
    }
    let mut current = Some(manager_id.to_string());
    let mut visited = HashSet::new();
    while let Some(id) = current {
        if id == agent_id || !visited.insert(id.clone()) {
            return true;
        }
        current = by_id.get(&id).and_then(|a| a.reports_to.clone());
    }
    false
}

pub fn apply_assignments(state: &mut AppState, assignments: &[AgentOrgAssignment]) -> AssignOrgResult {
    let mut updated = 0u32;
    let mut heads = Vec::new();

    // Clear previous head_agent_id on departments
    for dept in &mut state.departments {
        dept.head_agent_id = None;
    }

    for item in assignments {
        let Some(agent) = state.agents.get_mut(&item.agent_id) else {
            continue;
        };
        if is_system_agent(agent) {
            continue;
        }
        agent.department = item.department.clone();
        agent.reports_to = item.reports_to.clone();
        agent.manages_department = item.manages_department.clone();
        agent.status = "idle".to_string();
        let wallet_agent = agent.clone();
        ensure_agent_wallet(&mut state.token_economy, &wallet_agent);
        updated += 1;

        if let Some(dept_name) = &item.manages_department {
            heads.push(format!("{} → {}", agent.name, dept_name));
            if let Some(dept) = state
                .departments
                .iter_mut()
                .find(|d| d.name.eq_ignore_ascii_case(dept_name))
            {
                dept.head_agent_id = Some(item.agent_id.clone());
            }
        }
    }

    let snapshot = build_org_chart(state);
    let message = format!(
        "Assigned {updated} agent(s). {} department head(s) set.",
        heads.len()
    );

    AssignOrgResult {
        updated,
        heads,
        source: String::new(), // filled by caller
        message,
        snapshot,
    }
}

pub fn pick_billing_agent_public(state: &AppState) -> (String, String) {
    if let Some(agent) = state.agents.values().find(|a| {
        !is_system_agent(a)
            && (a.department.to_lowercase().contains("exec")
                || a.role.to_lowercase().contains("ceo")
                || a.role.to_lowercase().contains("coo"))
    }) {
        return (agent.id.clone(), agent.department.clone());
    }
    if let Some(agent) = state.agents.values().find(|a| !is_system_agent(a)) {
        return (agent.id.clone(), agent.department.clone());
    }
    ("system".into(), "Executive".into())
}

/// LLM assign **without** holding `AppState` (must not run under a long AppState lock).
pub fn try_llm_assignments_detached(
    settings: &crate::state::GameSettings,
    hub: &crate::state::HubState,
    department_providers: &std::collections::HashMap<String, String>,
    context: &str,
    agent_id: String,
    department: String,
) -> Option<(Vec<AgentOrgAssignment>, Option<crate::token_budget::ChargeContext>)> {
    if settings.pure_local_mode || settings.ai_provider == "mock" {
        return None;
    }
    let lang = crate::i18n::language_instruction(crate::i18n::language_from_settings(settings));
    let request = ChatRequest {
        system_prompt: format!(
            "{}\n\n{lang}\nAny narrative fields in JSON must use the company language. Keep JSON keys in English.",
            system_prompt()
        ),
        user_prompt: format!(
            "Assign org structure from this context:\n\n{context}\n\nReturn JSON only."
        ),
        temperature: 0.35,
        soul_id: None,
        context: None,
        conversation_turns: Vec::new(),
    };
    let (response, charge) = ai::chat_detached(
        settings,
        hub,
        department_providers,
        BilledChatRequest {
            request,
            agent_id,
            department,
            source: "assign_org_with_ai".into(),
        },
        None,
    )
    .ok()?;
    let list = parse_llm_assignments(&response.content).ok()?;
    Some((list, charge))
}

/// Instant pipeline — heuristic only. Safe under a short AppState lock.
pub fn run_assign_org_heuristic(state: &mut AppState) -> Result<AssignOrgResult, String> {
    let raw = heuristic_assignments(state)?;
    let sanitized = sanitize_assignments(state, raw)?;
    if sanitized.is_empty() {
        return Err("No valid assignments produced.".into());
    }
    let mut result = apply_assignments(state, &sanitized);
    result.source = "heuristic".to_string();
    result.message = format!(
        "{} (smart rules — role/dept fit, no freeze)",
        result.message
    );
    Ok(result)
}

/// Full pipeline used by the command when caller already holds `&mut AppState`.
/// Uses **heuristic only** so we never block the UI on an LLM while the global mutex is held.
pub fn run_assign_org(state: &mut AppState) -> Result<AssignOrgResult, String> {
    run_assign_org_heuristic(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{AgentRecord, AppState, CompanyDepartment};

    fn agent(id: &str, name: &str, role: &str, department: &str) -> AgentRecord {
        AgentRecord {
            id: id.into(),
            name: name.into(),
            role: role.into(),
            department: department.into(),
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
        }
    }

    fn seed_depts(state: &mut AppState) {
        for (id, name) in [
            ("d1", "Executive"),
            ("d2", "Engineering"),
            ("d3", "Marketing"),
            ("d4", "Human Resources"),
        ] {
            state.departments.push(CompanyDepartment {
                id: id.into(),
                name: name.into(),
                display_name: name.into(),
                sop: String::new(),
                brand_color: "#6d7f9b".into(),
                accent_color: "#5ec8ff".into(),
                building_id: id.into(),
                created_at: "2026-01-01T00:00:00Z".into(),
                parent_department_id: None,
                head_agent_id: None,
            });
        }
    }

    #[test]
    fn heuristic_maps_engineer_to_engineering_not_marketing() {
        let mut state = AppState::default();
        seed_depts(&mut state);
        state.agents.insert(
            "eng".into(),
            agent("eng", "Backend Engineer", "Developer", "Marketing"),
        );
        state.agents.insert(
            "coo".into(),
            agent("coo", "Hudson", "COO", "Executive"),
        );
        let list = heuristic_assignments(&state).expect("heuristic");
        let eng = list.iter().find(|a| a.agent_id == "eng").unwrap();
        assert_eq!(eng.department, "Engineering");
        assert_eq!(eng.reports_to.as_deref(), Some("coo"));
    }

    #[test]
    fn sanitize_breaks_self_loop() {
        let mut state = AppState::default();
        seed_depts(&mut state);
        state
            .agents
            .insert("a".into(), agent("a", "A", "Engineer", "Engineering"));
        let raw = vec![AgentOrgAssignment {
            agent_id: "a".into(),
            department: "Engineering".into(),
            reports_to: Some("a".into()),
            manages_department: None,
        }];
        let out = sanitize_assignments(&state, raw).unwrap();
        assert!(out[0].reports_to.is_none());
    }

    #[test]
    fn apply_sets_head_agent_id() {
        let mut state = AppState::default();
        seed_depts(&mut state);
        state
            .agents
            .insert("h".into(), agent("h", "Head", "Engineering Lead", "Engineering"));
        let list = vec![AgentOrgAssignment {
            agent_id: "h".into(),
            department: "Engineering".into(),
            reports_to: None,
            manages_department: Some("Engineering".into()),
        }];
        let _ = apply_assignments(&mut state, &list);
        let eng = state
            .departments
            .iter()
            .find(|d| d.name == "Engineering")
            .unwrap();
        assert_eq!(eng.head_agent_id.as_deref(), Some("h"));
    }
}
