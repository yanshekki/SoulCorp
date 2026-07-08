use crate::ai::{self, normalize_ai_provider_override, provider::ChatRequest, BilledChatRequest};
use crate::commands::departments::{
    CreateDepartmentRequest, DeleteDepartmentRequest, UpdateAgentOrgRequest,
};
use crate::commands::tier::ensure_agent_capacity;
use crate::db::persistence::commit;
use crate::departments::{
    department_names, ensure_default_departments, list_departments_snapshot,
};
use crate::soul::parse_soul_content;
use crate::state::{AgentRecord, AppState, CompanyDepartment, InternalProject};

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
    #[serde(default)]
    pub agent_runtime_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanyDepartmentsSnapshot {
    pub builtin: Vec<String>,
    pub custom: Vec<CompanyDepartment>,
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

fn require_v2_simulation(feature: &str) -> Result<(), String> {
    if crate::config::is_v2() {
        Ok(())
    } else {
        Err(format!(
            "{feature} requires the v2 game edition. Use `pnpm dev:v2` or build with PRODUCT_EDITION=v2."
        ))
    }
}

#[tauri::command]
pub fn list_company_departments(
    state: State<'_, Mutex<AppState>>,
) -> Result<CompanyDepartmentsSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_default_departments(&mut state);
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
        agent_runtime_mode: state.department_agent_runtimes.get(department).cloned(),
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
    crate::commands::departments::create_department(
        CreateDepartmentRequest {
            name: request.name,
            display_name: request.display_name,
            sop: request.sop,
            brand_color: request.brand_color,
            accent_color: request.accent_color,
            parent_department_id: None,
        },
        state,
        app,
    )
    .map(list_company_departments_from_snapshot)
}

#[tauri::command]
pub fn delete_custom_department(
    department_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<CompanyDepartmentsSnapshot, String> {
    let transfer_to = {
        let mut locked = state.lock().map_err(|e| e.to_string())?;
        ensure_default_departments(&mut locked);
        locked
            .departments
            .iter()
            .find(|department| department.id != department_id)
            .map(|department| department.name.clone())
            .ok_or_else(|| "No transfer target department available.".to_string())?
    };
    crate::commands::departments::delete_department(
        DeleteDepartmentRequest {
            department_id,
            transfer_to,
        },
        state,
        app,
    )
    .map(list_company_departments_from_snapshot)
}

#[tauri::command]
pub fn assign_agent_department(
    request: AssignAgentDepartmentRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AgentRecord, String> {
    crate::commands::departments::update_agent_org(
        UpdateAgentOrgRequest {
            agent_id: request.agent_id,
            department: Some(request.department),
            reports_to: None,
            manages_department: None,
        },
        state,
        app,
    )
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
        agent_runtime_mode: None,
        agent_kind: None,
        skills: crate::state::skills_for_role("AI Co-CEO"),
        reports_to: None,
        manages_department: Some("Executive".to_string()),
    };

    state.agents.insert(agent_id.clone(), record);
    state.co_ceo.agent_id = Some(agent_id);
    state.co_ceo.autonomy_enabled = crate::config::is_v2();
    let status = co_ceo_status_from_state(&state);
    commit(app, &state)?;
    Ok(status)
}

#[tauri::command]
pub async fn run_co_ceo_briefing(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<CoCeoBriefing, String> {
    let (_settings, _hub, context, co_ceo_id, co_ceo_department, co_ceo_provider, department_providers) = {
        let state = state.lock().map_err(|e| e.to_string())?;
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
        context: None,
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
    require_v2_simulation("Apply directive (morale & progress)")?;

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
        let pm_agent_id = state.default_pm_agent_id.clone();
        state.projects.push(InternalProject {
            id: format!("proj-{}", Uuid::new_v4()),
            title: request.title.clone(),
            progress: 0.08,
            priority: 2,
            owner_department: request.target_department.clone(),
            description: request.description.clone(),
            pm_agent_id,
            active_sprint_id: None,
            default_cycle_days: 14,
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
    require_v2_simulation("Co-CEO autonomy")?;
    state.co_ceo.autonomy_enabled = enabled;
    let status = co_ceo_status_from_state(&state);
    commit(app, &state)?;
    Ok(status)
}

pub fn apply_co_ceo_autonomy_tick(state: &mut AppState, app: &AppHandle) -> Option<String> {
    if !crate::config::is_v2() || !state.co_ceo.autonomy_enabled {
        return None;
    }
    if !state.tick.is_multiple_of(25) {
        return None;
    }

    let report = crate::orchestrator::apply_orchestrator_tick(state, app, true);
    if report.directives_issued > 0 {
        return Some(format!(
            "AI Co-CEO issued {} directive(s).",
            report.directives_issued
        ));
    }

    if let Some(project) = state.projects.iter_mut().min_by_key(|project| project.priority) {
        project.progress = (project.progress + 0.02).min(1.0);
    }
    if let Some(co_ceo_id) = state.co_ceo.agent_id.clone() {
        if let Some(agent) = state.agents.get_mut(&co_ceo_id) {
            agent.status = "working".to_string();
        }
    }
    report
        .messages
        .first()
        .cloned()
        .or_else(|| Some("AI Co-CEO advanced the top-priority project.".to_string()))
}

struct CoCeoPromptContext {
    company_name: String,
    departments: Vec<String>,
    prompt: String,
}

fn build_co_ceo_context(state: &AppState) -> CoCeoPromptContext {
    let departments = department_names(state);

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
        .departments
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
    let available = true;
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
    department_names(state)
}

fn list_company_departments_from_snapshot(
    snapshot: crate::departments::DepartmentsSnapshot,
) -> CompanyDepartmentsSnapshot {
    CompanyDepartmentsSnapshot {
        builtin: Vec::new(),
        custom: snapshot
            .departments
            .into_iter()
            .map(|entry| CompanyDepartment {
                id: entry.id,
                name: entry.name,
                display_name: entry.display_name,
                sop: entry.sop,
                brand_color: entry.brand_color,
                accent_color: entry.accent_color,
                building_id: entry.building_id,
                created_at: entry.created_at,
                parent_department_id: entry.parent_department_id,
                head_agent_id: entry.head_agent_id,
            })
            .collect(),
        buildings: snapshot
            .buildings
            .into_iter()
            .map(|building| CustomDepartmentBuilding {
                id: building.id,
                name: building.name,
                department: building.department,
                position: building.position,
                size: building.size,
                color: building.color,
                roof_color: building.roof_color,
                accent_color: building.accent_color,
                description: building.description,
            })
            .collect(),
        department_ai_providers: Vec::new(),
    }
}

fn list_company_departments_from_state(state: &AppState) -> CompanyDepartmentsSnapshot {
    let snapshot = list_departments_snapshot(state);
    let mut legacy = list_company_departments_from_snapshot(snapshot);
    legacy.department_ai_providers = collect_company_departments(state)
        .into_iter()
        .map(|department| DepartmentAiConfig {
            ai_provider: state.department_ai_providers.get(&department).cloned(),
            agent_runtime_mode: state.department_agent_runtimes.get(&department).cloned(),
            department,
        })
        .collect();
    legacy
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