use crate::agent_runtime::claw_kind::ClawRuntimeKind;
use crate::agent_runtime::openclaw::{
    claw_kind_from_settings, probe_claw, resolve_claw_binary, run_claw_for_task,
};
use crate::scrum::types::WorkNode;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenClawStatus {
    pub runtime_mode: String,
    pub runtime_id: String,
    pub runtime_label: String,
    pub binary_path: String,
    pub binary_available: bool,
    pub version: Option<String>,
    pub agent_command_available: bool,
    pub gateway_healthy: bool,
    pub use_local: bool,
    pub prefer_gateway: bool,
    pub default_agent_id: String,
    pub timeout_secs: u32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenClawTestRequest {
    pub work_node_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenClawTestResult {
    pub ok: bool,
    pub transport: Option<String>,
    pub preview: String,
    pub message: String,
}

#[tauri::command]
pub fn get_openclaw_status(state: State<'_, Mutex<AppState>>) -> Result<OpenClawStatus, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let kind = claw_kind_from_settings(&state.settings).unwrap_or(ClawRuntimeKind::OpenClaw);
    let probe = probe_claw(&state.settings, kind);
    Ok(OpenClawStatus {
        runtime_mode: state.settings.agent_runtime_mode.clone(),
        runtime_id: probe.runtime_id.clone(),
        runtime_label: probe.runtime_label.clone(),
        binary_path: probe.binary_path,
        binary_available: probe.binary_available,
        version: probe.version,
        agent_command_available: probe.agent_command_available,
        gateway_healthy: probe.gateway_healthy,
        use_local: state.settings.openclaw_use_local,
        prefer_gateway: state.settings.openclaw_prefer_gateway,
        default_agent_id: state.settings.openclaw_default_agent_id.clone(),
        timeout_secs: state.settings.openclaw_timeout_secs,
        message: probe.message,
    })
}

#[tauri::command]
pub fn test_openclaw_runtime(
    request: OpenClawTestRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<OpenClawTestResult, String> {
    let (settings, company_id, kind, task, agent, project_title, workspace_root) = {
        let state = state.lock().map_err(|e| e.to_string())?;
        let Some(kind) = claw_kind_from_settings(&state.settings) else {
            return Ok(OpenClawTestResult {
                ok: false,
                transport: None,
                preview: String::new(),
                message: "Set runtime mode to a Claw subprocess (OpenClaw, Hermes, IronClaw, or NanoClaw) first.".into(),
            });
        };
        let _ = resolve_claw_binary(&state.settings, kind)?;
        let runtime_label = kind.display_name();

        let (task, agent, project_title) = if let Some(work_node_id) = request.work_node_id {
            let task = state
                .work_nodes
                .iter()
                .find(|node| node.id == work_node_id)
                .cloned()
                .ok_or_else(|| "Work node not found.".to_string())?;
            let agent_id = task
                .assignee_agent_id
                .clone()
                .ok_or_else(|| format!("Assign an agent before testing {runtime_label}."))?;
            let agent = state
                .agents
                .get(&agent_id)
                .cloned()
                .ok_or_else(|| "Assignee not found.".to_string())?;
            let project_title = state
                .projects
                .iter()
                .find(|project| project.id == task.project_id)
                .map(|project| project.title.clone())
                .unwrap_or_else(|| "Company project".to_string());
            (task, agent, project_title)
        } else {
            let agent = state
                .agents
                .values()
                .find(|record| !crate::fate::is_system_agent(record))
                .cloned()
                .ok_or_else(|| format!("No agents available for {runtime_label} smoke test."))?;
            let task = WorkNode {
                id: format!("{}-smoke-test", kind.id()),
                parent_id: None,
                project_id: state
                    .projects
                    .first()
                    .map(|project| project.id.clone())
                    .unwrap_or_else(|| "project-smoke".into()),
                kind: crate::scrum::WorkNodeKind::Task,
                title: format!("{runtime_label} connectivity check"),
                description: format!(
                    "Reply with a one-line confirmation that {runtime_label} can execute SoulCorp tasks."
                ),
                status: crate::scrum::WorkNodeStatus::Ready,
                priority: 3,
                story_points: 1,
                backlog_rank: 0,
                assignee_agent_id: Some(agent.id.clone()),
                assigned_by_manager_id: None,
                owner_pm_agent_id: None,
                retry_count: 0,
                department: agent.department.clone(),
                sprint_id: None,
                depends_on: Vec::new(),
                acceptance_criteria: vec!["Return a short confirmation sentence.".into()],
                linked_workspace_page_id: None,
                linked_gig_contract_id: None,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
                completed_at: None,
            };
            let project_title = state
                .projects
                .first()
                .map(|project| project.title.clone())
                .unwrap_or_else(|| "SoulCorp".to_string());
            (task, agent, project_title)
        };

        let workspace_root = if state.company_id.is_empty() {
            None
        } else {
            let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            Some(crate::workspace::company_workspace_root(
                &dir,
                &state.company_id,
            ))
        };

        (
            state.settings.clone(),
            state.company_id.clone(),
            kind,
            task,
            agent,
            project_title,
            workspace_root,
        )
    };

    let runtime_label = kind.display_name();
    match run_claw_for_task(
        kind,
        &settings,
        &company_id,
        &task,
        &agent,
        &project_title,
        workspace_root.as_deref(),
    ) {
        Ok(result) => {
            let preview = if result.content.chars().count() > 240 {
                format!(
                    "{}…",
                    result.content.chars().take(240).collect::<String>()
                )
            } else {
                result.content.clone()
            };
            let transport = result.transport.clone();
            Ok(OpenClawTestResult {
                ok: true,
                transport: Some(transport.clone()),
                preview,
                message: format!(
                    "{runtime_label} test succeeded via {transport} in {} ms.",
                    result.duration_ms
                ),
            })
        }
        Err(error) => Ok(OpenClawTestResult {
            ok: false,
            transport: None,
            preview: String::new(),
            message: error,
        }),
    }
}