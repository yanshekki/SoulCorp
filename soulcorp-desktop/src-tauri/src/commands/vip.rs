use crate::ai::{self, normalize_ai_provider_override, provider::ChatRequest, BilledChatRequest};
use crate::commands::tier::ensure_agent_capacity;
use crate::db::persistence::commit;
use crate::soul::parse_soul_content;
use crate::state::{AgentRecord, AppState, CustomDepartment, InternalProject};
use crate::tier::can_use_feature;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCustomDepartmentRequest {
    pub name: String,
    pub display_name: String,
    pub sop: String,
    pub brand_color: String,
    pub accent_color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomDepartmentBuilding {
    pub id: String,
    pub name: String,
    pub department: String,
    pub position: [f32; 3],
    pub size: [f32; 3],
    pub color: String,
    pub roof_color: String,
    pub accent_color: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepartmentAiConfig {
    pub department: String,
    pub ai_provider: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanyDepartmentsSnapshot {
    pub builtin: Vec<String>,
    pub custom: Vec<CustomDepartment>,
    pub buildings: Vec<CustomDepartmentBuilding>,
    #[serde(default)]
    pub department_ai_providers: Vec<DepartmentAiConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateDepartmentAiProviderRequest {
    pub department: String,
    pub ai_provider: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignAgentDepartmentRequest {
    pub agent_id: String,
    pub department: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoCeoStatus {
    pub available: bool,
    pub spawned: bool,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub autonomy_enabled: bool,
    pub last_briefing_at: Option<String>,
    pub last_directive: Option<String>,
    pub directives_applied: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoCeoDirective {
    pub id: String,
    pub title: String,
    pub description: String,
    pub target_department: String,
    pub project_progress_delta: f32,
    pub morale_delta: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoCeoBriefing {
    pub summary: String,
    pub provider: String,
    pub directives: Vec<CoCeoDirective>,
    pub generated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyCoCeoDirectiveRequest {
    pub directive_id: String,
    pub title: String,
    pub description: String,
    pub target_department: String,
    pub project_progress_delta: f32,
    pub morale_delta: f32,
}

fn effective_tier(state: &AppState) -> String {
    if state.settings.pure_local_mode {
        "local".to_string()
    } else {
        state.hub.user_tier.clone()
    }
}

fn ensure_vip_feature(state: &AppState, feature: &str) -> Result<(), String> {
    let tier = effective_tier(state);
    if can_use_feature(&tier, feature) {
        Ok(())
    } else {
        Err(format!(
            "VIP tier required for '{feature}'. Upgrade to unlock executive features."
        ))
    }
}

fn builtin_departments() -> Vec<String> {
    vec![
        "Engineering".to_string(),
        "Human Resources".to_string(),
        "Executive".to_string(),
        "Marketing".to_string(),
        "Marketplace".to_string(),
    ]
}

fn custom_building_for_department(department: &CustomDepartment, index: usize) -> CustomDepartmentBuilding {
    let x = -10.0 + (index as f32 * 3.6);
    CustomDepartmentBuilding {
        id: department.building_id.clone(),
        name: department.display_name.clone(),
        department: department.name.clone(),
        position: [x, 0.0, -10.0 - (index as f32 * 0.8)],
        size: [3.0, 2.4, 3.0],
        color: department.brand_color.clone(),
        roof_color: department.accent_color.clone(),
        accent_color: department.accent_color.clone(),
        description: department.sop.clone(),
    }
}

#[tauri::command]
pub fn list_company_departments(
    state: State<'_, Mutex<AppState>>,
) -> Result<CompanyDepartmentsSnapshot, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(list_company_departments_from_state(&state))
}

#[tauri::command]
pub fn update_department_ai_provider(
    request: UpdateDepartmentAiProviderRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<DepartmentAiConfig, String> {
    let department = request.department.trim();
    if department.is_empty() {
        return Err("Department name is required.".to_string());
    }

    let ai_provider = normalize_ai_provider_override(request.ai_provider.as_deref())?;
    let mut state = state.lock().map_err(|e| e.to_string())?;
    if let Some(provider) = ai_provider.clone() {
        state
            .department_ai_providers
            .insert(department.to_string(), provider);
    } else {
        state.department_ai_providers.remove(department);
    }
    let snapshot = DepartmentAiConfig {
        department: department.to_string(),
        ai_provider,
    };
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn create_custom_department(
    request: CreateCustomDepartmentRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<CompanyDepartmentsSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_vip_feature(&state, "custom_departments")?;

    let name = request.name.trim();
    let display_name = request.display_name.trim();
    if name.is_empty() || display_name.is_empty() {
        return Err("Department name and display name are required.".to_string());
    }
    if state.custom_departments.len() >= 6 {
        return Err("VIP companies can maintain up to 6 custom departments.".to_string());
    }
    if state
        .custom_departments
        .iter()
        .any(|department| department.name.eq_ignore_ascii_case(name))
    {
        return Err(format!("Department '{name}' already exists."));
    }

    let department = CustomDepartment {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        display_name: display_name.to_string(),
        sop: request.sop.trim().to_string(),
        brand_color: normalize_hex_color(&request.brand_color, "#6d7f9b"),
        accent_color: normalize_hex_color(&request.accent_color, "#5ec8ff"),
        building_id: format!("custom-{}", Uuid::new_v4()),
        created_at: Utc::now().to_rfc3339(),
    };
    state.custom_departments.push(department);
    let snapshot = list_company_departments_from_state(&state);
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn delete_custom_department(
    department_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<CompanyDepartmentsSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_vip_feature(&state, "custom_departments")?;
    let removed_name = state
        .custom_departments
        .iter()
        .find(|department| department.id == department_id)
        .map(|department| department.name.clone());
    let before = state.custom_departments.len();
    state
        .custom_departments
        .retain(|department| department.id != department_id);
    if state.custom_departments.len() == before {
        return Err("Custom department not found.".to_string());
    }
    if let Some(name) = removed_name {
        state.department_ai_providers.remove(&name);
    }
    let snapshot = list_company_departments_from_state(&state);
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn assign_agent_department(
    request: AssignAgentDepartmentRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AgentRecord, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    let department_exists = builtin_departments().iter().any(|dept| dept == &request.department)
        || state
            .custom_departments
            .iter()
            .any(|dept| dept.name == request.department);
    if !department_exists {
        return Err(format!("Unknown department '{}'.", request.department));
    }

    let agent = state
        .agents
        .get_mut(&request.agent_id)
        .ok_or_else(|| format!("Agent {} not found.", request.agent_id))?;
    agent.department = request.department.clone();
    agent.status = "idle".to_string();
    let snapshot = agent.clone();
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn get_co_ceo_status(state: State<'_, Mutex<AppState>>) -> Result<CoCeoStatus, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(co_ceo_status_from_state(&state))
}

#[tauri::command]
pub fn spawn_co_ceo(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<CoCeoStatus, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_vip_feature(&state, "ai_co_ceo")?;

    if let Some(agent_id) = state.co_ceo.agent_id.clone() {
        if state.agents.contains_key(&agent_id) {
            return Ok(co_ceo_status_from_state(&state));
        }
    }

    ensure_agent_capacity(&state)?;
    let agent_id = "agent-co-ceo".to_string();
    let soul = parse_soul_content(
        "# Aria Nexus\n\n## Personality\nStrategic, calm, and decisive.\n\n## Values\nLong-term growth, team leverage, and clarity.\n\n## Communication Style\nExecutive briefings with concrete next steps.",
    )
    .ok();

    let record = AgentRecord {
        id: agent_id.clone(),
        name: "Aria Nexus".to_string(),
        role: "AI Co-CEO".to_string(),
        department: "Executive".to_string(),
        morale: 0.92,
        energy: 0.95,
        salary: 6800.0,
        status: "working".to_string(),
        soul,
        soul_id: None,
        ai_provider: None,
        agent_kind: None,
        skills: crate::state::skills_for_role("AI Co-CEO"),
    };

    state.agents.insert(agent_id.clone(), record);
    state.co_ceo.agent_id = Some(agent_id);
    state.co_ceo.autonomy_enabled = true;
    let status = co_ceo_status_from_state(&state);
    commit(app, &state)?;
    Ok(status)
}

#[tauri::command]
pub async fn run_co_ceo_briefing(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<CoCeoBriefing, String> {
    let (settings, hub, context, co_ceo_id, co_ceo_department, co_ceo_provider, department_providers) = {
        let state = state.lock().map_err(|e| e.to_string())?;
        ensure_vip_feature(&state, "ai_co_ceo")?;
        let co_ceo_id = state
            .co_ceo
            .agent_id
            .clone()
            .ok_or_else(|| "Spawn the AI Co-CEO before requesting a briefing.".to_string())?;
        let co_ceo_agent = state
            .agents
            .get(&co_ceo_id)
            .ok_or_else(|| "AI Co-CEO agent record is missing.".to_string())?;
        let co_ceo_department = co_ceo_agent.department.clone();
        let co_ceo_provider = co_ceo_agent.ai_provider.clone();
        (
            state.settings.clone(),
            state.hub.clone(),
            build_co_ceo_context(&state),
            co_ceo_id,
            co_ceo_department,
            co_ceo_provider,
            state.department_ai_providers.clone(),
        )
    };

    let chat_request = ChatRequest {
        system_prompt: format!(
            "You are Aria Nexus, the AI Co-CEO of {}. Produce an executive briefing with exactly 3 numbered directives. Each directive must name a department and a concrete action. Keep the summary under 80 words.",
            context.company_name
        ),
        user_prompt: context.prompt,
        temperature: 0.65,
        soul_id: None,
        conversation_turns: Vec::new(),
    };

    let provider_override = co_ceo_provider.clone();
    let progress = crate::progress::ProgressReporter::new(app.clone(), "co_ceo_briefing");
    progress.emit_indeterminate("Generating Co-CEO executive briefing…", Some("llm"));
    let app_for_blocking = app.clone();
    let co_ceo_id_for_call = co_ceo_id.clone();
    let co_ceo_department_for_call = co_ceo_department.clone();
    let department_providers_for_call = department_providers.clone();
    let response = tokio::task::spawn_blocking(move || {
        let state_mutex = app_for_blocking.state::<std::sync::Mutex<crate::state::AppState>>();
        let mut guard = state_mutex.lock().map_err(|e| e.to_string())?;
        ai::chat_with_fallback_billed(
            &mut guard,
            BilledChatRequest {
                request: chat_request,
                agent_id: co_ceo_id_for_call,
                department: co_ceo_department_for_call,
                source: "co_ceo_briefing".into(),
            },
            &department_providers_for_call,
            provider_override.as_deref(),
        )
    })
    .await
    .map_err(|e| e.to_string())??;

    let directives = parse_directives_from_briefing(&response.content, &context.departments);
    let briefing = CoCeoBriefing {
        summary: response.content.lines().take(4).collect::<Vec<_>>().join(" "),
        provider: response.provider,
        directives,
        generated_at: Utc::now().to_rfc3339(),
    };

    let mut state = state.lock().map_err(|e| e.to_string())?;
    state.co_ceo.last_briefing_at = Some(briefing.generated_at.clone());
    state.co_ceo.last_directive = briefing.directives.first().map(|directive| directive.title.clone());
    if let Some(agent) = state.agents.get_mut(&co_ceo_id) {
        agent.status = "working".to_string();
    }
    commit(app, &state)?;
    progress.finish("Executive briefing ready");
    progress.clear();
    Ok(briefing)
}

#[tauri::command]
pub fn apply_co_ceo_directive(
    request: ApplyCoCeoDirectiveRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<CoCeoStatus, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_vip_feature(&state, "ai_co_ceo")?;

    let project_index = state
        .projects
        .iter()
        .position(|project| project.owner_department == request.target_department);
    if let Some(index) = project_index {
        let project = &mut state.projects[index];
        project.progress =
            (project.progress + request.project_progress_delta.clamp(0.01, 0.12)).min(1.0);
        if project.priority > 1 {
            project.priority -= 1;
        }
    } else if let Some(project) = state.projects.first_mut() {
        project.progress =
            (project.progress + request.project_progress_delta.clamp(0.01, 0.12)).min(1.0);
    } else {
        state.projects.push(InternalProject {
            id: format!("proj-{}", Uuid::new_v4()),
            title: request.title.clone(),
            progress: 0.08,
            priority: 2,
            owner_department: request.target_department.clone(),
        });
    }

    let co_ceo_id = state.co_ceo.agent_id.clone();
    for agent in state.agents.values_mut() {
        if agent.department == request.target_department {
            agent.morale = (agent.morale + request.morale_delta.clamp(0.01, 0.08)).min(1.0);
            if co_ceo_id.as_ref() != Some(&agent.id) {
                agent.status = "working".to_string();
            }
        }
    }

    state.co_ceo.last_directive = Some(request.title);
    state.co_ceo.directives_applied += 1;
    let status = co_ceo_status_from_state(&state);
    commit(app, &state)?;
    Ok(status)
}

#[tauri::command]
pub fn set_co_ceo_autonomy(
    enabled: bool,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<CoCeoStatus, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_vip_feature(&state, "ai_co_ceo")?;
    state.co_ceo.autonomy_enabled = enabled;
    let status = co_ceo_status_from_state(&state);
    commit(app, &state)?;
    Ok(status)
}

pub fn apply_co_ceo_autonomy_tick(state: &mut AppState) -> Option<String> {
    if !state.co_ceo.autonomy_enabled {
        return None;
    }
    let tier = if state.settings.pure_local_mode {
        "local"
    } else {
        state.hub.user_tier.as_str()
    };
    if !can_use_feature(tier, "ai_co_ceo") {
        return None;
    }
    let co_ceo_id = state.co_ceo.agent_id.clone()?;
    if state.tick % 25 != 0 {
        return None;
    }

    if let Some(project) = state.projects.iter_mut().min_by_key(|project| project.priority) {
        project.progress = (project.progress + 0.02).min(1.0);
    }
    if let Some(agent) = state.agents.get_mut(&co_ceo_id) {
        agent.status = "working".to_string();
    }
    Some("AI Co-CEO advanced the top-priority project.".to_string())
}

struct CoCeoPromptContext {
    company_name: String,
    departments: Vec<String>,
    prompt: String,
}

fn build_co_ceo_context(state: &AppState) -> CoCeoPromptContext {
    let mut departments = builtin_departments();
    departments.extend(
        state
            .custom_departments
            .iter()
            .map(|department| department.name.clone()),
    );

    let roster = state
        .agents
        .values()
        .map(|agent| {
            format!(
                "- {} ({}, {}) morale {:.0}%",
                agent.name,
                agent.role,
                agent.department,
                agent.morale * 100.0
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let projects = state
        .projects
        .iter()
        .map(|project| {
            format!(
                "- {} [{}] {:.0}% complete",
                project.title,
                project.owner_department,
                project.progress * 100.0
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let custom_sops = state
        .custom_departments
        .iter()
        .map(|department| format!("- {}: {}", department.display_name, department.sop))
        .collect::<Vec<_>>()
        .join("\n");

    let prompt = format!(
        "Company snapshot for {company}:\nAgents:\n{roster}\nProjects:\n{projects}\nCustom department SOPs:\n{custom_sops}\n\nProvide today's executive briefing and 3 directives.",
        company = state.company_name,
        roster = roster,
        projects = projects,
        custom_sops = if custom_sops.is_empty() {
            "None yet.".to_string()
        } else {
            custom_sops
        }
    );

    CoCeoPromptContext {
        company_name: state.company_name.clone(),
        departments,
        prompt,
    }
}

fn parse_directives_from_briefing(content: &str, departments: &[String]) -> Vec<CoCeoDirective> {
    let fallback_department = departments
        .first()
        .cloned()
        .unwrap_or_else(|| "Executive".to_string());

    let mut directives = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let looks_numbered = trimmed.chars().next().map(|ch| ch.is_ascii_digit()).unwrap_or(false)
            || trimmed.starts_with('-');
        if !looks_numbered {
            continue;
        }

        let title = trimmed
            .trim_start_matches(|ch: char| !ch.is_alphabetic())
            .split([':', '.', '–', '-'])
            .next()
            .unwrap_or("Strategic directive")
            .trim()
            .to_string();
        if title.len() < 4 {
            continue;
        }

        let target_department = departments
            .iter()
            .find(|department| trimmed.to_lowercase().contains(&department.to_lowercase()))
            .cloned()
            .unwrap_or_else(|| fallback_department.clone());

        directives.push(CoCeoDirective {
            id: Uuid::new_v4().to_string(),
            title: title.clone(),
            description: trimmed.to_string(),
            target_department,
            project_progress_delta: 0.04,
            morale_delta: 0.03,
        });
        if directives.len() == 3 {
            break;
        }
    }

    if directives.is_empty() {
        directives.push(CoCeoDirective {
            id: Uuid::new_v4().to_string(),
            title: "Focus the core roadmap".to_string(),
            description: content.to_string(),
            target_department: fallback_department,
            project_progress_delta: 0.05,
            morale_delta: 0.04,
        });
    }

    directives
}

fn co_ceo_status_from_state(state: &AppState) -> CoCeoStatus {
    let tier = effective_tier(state);
    let available = can_use_feature(&tier, "ai_co_ceo");
    let agent_id = state.co_ceo.agent_id.clone();
    let agent_name = agent_id
        .as_ref()
        .and_then(|id| state.agents.get(id))
        .map(|agent| agent.name.clone());

    CoCeoStatus {
        available,
        spawned: agent_id
            .as_ref()
            .map(|id| state.agents.contains_key(id))
            .unwrap_or(false),
        agent_id,
        agent_name,
        autonomy_enabled: state.co_ceo.autonomy_enabled,
        last_briefing_at: state.co_ceo.last_briefing_at.clone(),
        last_directive: state.co_ceo.last_directive.clone(),
        directives_applied: state.co_ceo.directives_applied,
    }
}

fn collect_company_departments(state: &AppState) -> Vec<String> {
    let mut departments = builtin_departments();
    for custom in &state.custom_departments {
        if !departments
            .iter()
            .any(|department| department == &custom.name)
        {
            departments.push(custom.name.clone());
        }
    }
    for agent in state.agents.values() {
        if !departments
            .iter()
            .any(|department| department == &agent.department)
        {
            departments.push(agent.department.clone());
        }
    }
    departments.sort();
    departments.dedup();
    departments
}

fn list_company_departments_from_state(state: &AppState) -> CompanyDepartmentsSnapshot {
    let buildings = state
        .custom_departments
        .iter()
        .enumerate()
        .map(|(index, department)| custom_building_for_department(department, index))
        .collect();
    let department_ai_providers = collect_company_departments(state)
        .into_iter()
        .map(|department| DepartmentAiConfig {
            ai_provider: state.department_ai_providers.get(&department).cloned(),
            department,
        })
        .collect();

    CompanyDepartmentsSnapshot {
        builtin: builtin_departments(),
        custom: state.custom_departments.clone(),
        buildings,
        department_ai_providers,
    }
}

fn normalize_hex_color(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.starts_with('#') && trimmed.len() >= 4 {
        trimmed.to_string()
    } else {
        fallback.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_numbered_directives_from_briefing() {
        let content = "1. Engineering: Ship the onboarding flow.\n2. Marketing: Launch the Q3 campaign.\n3. HR: Run morale check-ins.";
        let departments = vec!["Engineering".into(), "Marketing".into(), "Human Resources".into()];
        let directives = parse_directives_from_briefing(content, &departments);
        assert!(!directives.is_empty());
        assert!(directives.len() <= 3);
    }
}