use serde::{Deserialize, Serialize};

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
    pub role: String,
    pub dept: String,
    pub status: String,
}

#[tauri::command]
pub fn start_local_agent(request: StartAgentRequest) -> Result<AgentInfo, String> {
    Ok(AgentInfo {
        agent_id: format!("agent-{}", uuid::Uuid::new_v4()),
        role: request.role,
        dept: request.dept,
        status: "idle".to_string(),
    })
}
