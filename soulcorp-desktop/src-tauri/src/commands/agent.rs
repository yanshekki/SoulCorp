use crate::ai::normalize_agent_ai_provider;
use crate::commands::onboarding::persist_single_agent_soul;
use crate::commands::tier::ensure_agent_capacity;
use crate::db::persistence::commit;
use crate::soul::{parse_soul_content, parse_soul_md, soul_profile_from_editor_content, SoulProfile};
use crate::state::{AgentRecord, AppState};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct StartAgentRequest {
    pub soul_md_path: String,
    pub role: String,
    pub dept: String,
    pub ai_provider: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentInfo {
    pub agent_id: String,
    pub name: String,
    pub role: String,
    pub dept: String,
    pub status: String,
    pub morale: f32,
    pub energy: f32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoadSoulRequest {
    pub agent_id: String,
    pub soul_md_path: Option<String>,
    pub soul_md_content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateAgentSoulRequest {
    pub agent_id: String,
    pub soul_md_content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateAgentAiProviderRequest {
    pub agent_id: String,
    pub ai_provider: Option<String>,
}

fn apply_soul_to_agent(agent: &mut AgentRecord, profile: SoulProfile) -> SoulProfile {
    agent.name = profile.name.clone();
    agent.soul = Some(profile.clone());
    profile
}

#[tauri::command]
pub fn start_local_agent(
    request: StartAgentRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AgentInfo, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_agent_capacity(&state)?;
    let soul = parse_soul_md(&request.soul_md_path).ok();
    let agent_id = format!("agent-{}", Uuid::new_v4());
    let name = soul
        .as_ref()
        .map(|profile| profile.name.clone())
        .unwrap_or_else(|| "New Agent".to_string());
    let ai_provider = normalize_agent_ai_provider(Some(&request.ai_provider))?;

    state.agents.insert(
        agent_id.clone(),
        AgentRecord {
            id: agent_id.clone(),
            name: name.clone(),
            role: request.role.clone(),
            department: request.dept.clone(),
            morale: 0.75,
            energy: 1.0,
            salary: 3500.0,
            status: "idle".to_string(),
            soul,
            soul_id: None,
            ai_provider,
            agent_kind: None,
            skills: crate::state::skills_for_role(&request.role),
            reports_to: None,
            manages_department: None,
        },
    );

    let snapshot = state.agents.get(&agent_id).cloned();
    if let Some(agent) = snapshot {
        persist_single_agent_soul(&app, &state, &agent)?;
    }

    let response = AgentInfo {
        agent_id,
        name,
        role: request.role,
        dept: request.dept,
        status: "idle".to_string(),
        morale: 0.75,
        energy: 1.0,
    };
    commit(app, &state)?;
    Ok(response)
}

fn update_agent_soul_in_state(
    state: &mut AppState,
    app: &AppHandle,
    agent_id: &str,
    soul_md_content: &str,
) -> Result<AgentRecord, String> {
    let profile = soul_profile_from_editor_content(soul_md_content)?;

    let agent = state
        .agents
        .get_mut(agent_id)
        .ok_or_else(|| format!("Agent {agent_id} not found."))?;

    if agent.agent_kind.as_deref() == Some("fate") {
        return Err("Fate agent persona cannot be edited.".to_string());
    }

    apply_soul_to_agent(agent, profile);
    agent.soul_id = None;
    let snapshot = agent.clone();
    persist_single_agent_soul(app, state, &snapshot)?;
    commit(app.clone(), state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn update_agent_soul(
    request: UpdateAgentSoulRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AgentRecord, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    update_agent_soul_in_state(&mut state, &app, &request.agent_id, &request.soul_md_content)
}

#[tauri::command]
pub fn load_agent_soul(
    request: LoadSoulRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<SoulProfile, String> {
    let content = if let Some(path) = request.soul_md_path {
        std::fs::read_to_string(std::path::Path::new(&path)).map_err(|e| e.to_string())?
    } else if let Some(content) = request.soul_md_content {
        content
    } else {
        return Err("Either soul_md_path or soul_md_content is required.".to_string());
    };

    let mut state = state.lock().map_err(|e| e.to_string())?;
    let updated =
        update_agent_soul_in_state(&mut state, &app, &request.agent_id, &content)?;
    updated
        .soul
        .ok_or_else(|| "Agent soul missing after update.".to_string())
}

#[tauri::command]
pub fn update_agent_ai_provider(
    request: UpdateAgentAiProviderRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AgentRecord, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    let ai_provider = normalize_agent_ai_provider(request.ai_provider.as_deref())?;
    let agent = state
        .agents
        .get_mut(&request.agent_id)
        .ok_or_else(|| format!("Agent {} not found.", request.agent_id))?;
    agent.ai_provider = ai_provider;
    let snapshot = agent.clone();
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn list_agents(state: State<'_, Mutex<AppState>>) -> Result<Vec<AgentRecord>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.agents.values().cloned().collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::soul::parse_soul_content;

    #[test]
    fn editor_content_clears_hub_prompt_source() {
        let content = "# Nova\n\n## Personality\nCurious.\n\n## Values\nLearn.\n\n## Communication Style\nBrief.\n";
        let profile = soul_profile_from_editor_content(content).expect("profile");
        assert_eq!(profile.name, "Nova");
        assert!(profile.system_prompt_source.is_none());
        assert!(profile.hub_file_type.is_none());
        assert_eq!(profile.raw_content, content);
    }

    #[test]
    fn update_clears_hub_link_fields_in_profile() {
        let content = "# Nova\n\n## Personality\nCurious.\n\n## Values\nLearn.\n\n## Communication Style\nBrief.\n";
        let profile = soul_profile_from_editor_content(content).expect("profile");
        assert!(profile.system_prompt_source.is_none());
        assert!(profile.hub_file_type.is_none());
    }

    #[test]
    fn edited_soul_clears_hub_soul_id_on_agent() {
        let content = "# Nova\n\n## Personality\nCurious.\n\n## Values\nLearn.\n\n## Communication Style\nBrief.\n";
        let profile = soul_profile_from_editor_content(content).expect("profile");
        let mut agent = AgentRecord {
            id: "agent-1".to_string(),
            name: "Mira".to_string(),
            role: "Senior Dev".to_string(),
            department: "Engineering".to_string(),
            morale: 0.8,
            energy: 0.9,
            salary: 4000.0,
            status: "idle".to_string(),
            soul: None,
            soul_id: Some(99),
            ai_provider: None,
            agent_kind: None,
            skills: vec![],
            reports_to: None,
            manages_department: None,
        };
        apply_soul_to_agent(&mut agent, profile);
        agent.soul_id = None;
        assert_eq!(agent.soul_id, None);
        assert_eq!(agent.name, "Nova");
        assert!(agent.soul.as_ref().unwrap().system_prompt_source.is_none());
    }

    #[test]
    fn editor_content_reparses_sections() {
        let content = "# Nova\n\n## Personality\nCurious.\n\n## Values\nLearn.\n\n## Communication Style\nBrief.\n";
        let mut stale = parse_soul_content(content).expect("parse");
        stale.system_prompt_source = Some("=== MODULE: SOUL.md ===\nOld hub".to_string());
        stale.personality = "Stale".to_string();

        let profile = soul_profile_from_editor_content(content).expect("profile");
        assert_eq!(profile.personality, "Curious.");
        assert!(profile.system_prompt_source.is_none());
    }
}