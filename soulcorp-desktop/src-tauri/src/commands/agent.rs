use crate::soul::{parse_soul_content, parse_soul_md, SoulProfile};
use crate::state::{AgentRecord, AppState};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
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

#[tauri::command]
pub fn start_local_agent(
    request: StartAgentRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<AgentInfo, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    let soul = parse_soul_md(&request.soul_md_path).ok();
    let agent_id = format!("agent-{}", Uuid::new_v4());
    let name = soul
        .as_ref()
        .map(|profile| profile.name.clone())
        .unwrap_or_else(|| "New Agent".to_string());

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
        },
    );

    Ok(AgentInfo {
        agent_id,
        name,
        role: request.role,
        dept: request.dept,
        status: "idle".to_string(),
        morale: 0.75,
        energy: 1.0,
    })
}

#[tauri::command]
pub fn load_agent_soul(
    request: LoadSoulRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<SoulProfile, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    let profile = if let Some(path) = request.soul_md_path {
        parse_soul_md(&path)?
    } else if let Some(content) = request.soul_md_content {
        parse_soul_content(&content)?
    } else {
        return Err("Either soul_md_path or soul_md_content is required.".to_string());
    };

    let agent = state
        .agents
        .get_mut(&request.agent_id)
        .ok_or_else(|| "Agent not found.".to_string())?;

    agent.name = profile.name.clone();
    agent.soul = Some(profile.clone());
    Ok(profile)
}

#[tauri::command]
pub fn list_agents(state: State<'_, Mutex<AppState>>) -> Result<Vec<AgentRecord>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.agents.values().cloned().collect())
}
