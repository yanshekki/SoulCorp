use crate::agent_runtime::{
    catalog, probe_active_runtime, runtime_by_id, RuntimeCatalog, RuntimeProbe, RuntimeProbeSummary,
};
use crate::agent_runtime::openclaw::run_openclaw_for_task;
use crate::scrum::types::WorkNode;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRuntimeStatus {
    pub runtime_mode: String,
    pub runtime_id: String,
    pub runtime_label: String,
    pub adapter: String,
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
pub struct AgentRuntimeTestRequest {
    pub work_node_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRuntimeTestResult {
    pub ok: bool,
    pub transport: Option<String>,
    pub preview: String,
    pub message: String,
}

pub type OpenClawStatus = AgentRuntimeStatus;
pub type OpenClawTestRequest = AgentRuntimeTestRequest;
pub type OpenClawTestResult = AgentRuntimeTestResult;

fn status_from_probe(settings: &crate::state::GameSettings, probe: RuntimeProbe) -> AgentRuntimeStatus {
    AgentRuntimeStatus {
        runtime_mode: settings.agent_runtime_mode.clone(),
        runtime_id: probe.runtime_id,
        runtime_label: probe.runtime_label,
        adapter: probe.adapter,
        binary_path: probe.binary_path,
        binary_available: probe.binary_available,
        version: probe.version,
        agent_command_available: probe.agent_command_available,
        gateway_healthy: probe.gateway_healthy,
        use_local: settings.openclaw_use_local,
        prefer_gateway: settings.openclaw_prefer_gateway,
        default_agent_id: settings.openclaw_default_agent_id.clone(),
        timeout_secs: settings.openclaw_timeout_secs,
        message: probe.message,
    }
}

#[tauri::command]
pub fn get_agent_runtime_catalog() -> Result<RuntimeCatalog, String> {
    Ok(catalog().clone())
}

#[tauri::command]
pub fn get_agent_runtime_status(state: State<'_, Mutex<AppState>>) -> Result<AgentRuntimeStatus, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let probe = probe_active_runtime(&state.settings);
    Ok(status_from_probe(&state.settings, probe))
}

#[tauri::command]
pub fn get_openclaw_status(state: State<'_, Mutex<AppState>>) -> Result<AgentRuntimeStatus, String> {
    get_agent_runtime_status(state)
}

#[tauri::command]
pub fn probe_all_agent_runtimes(state: State<'_, Mutex<AppState>>) -> Result<Vec<RuntimeProbeSummary>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let mut summaries = Vec::new();
    for entry in &catalog().runtimes {
        if entry.id == "llm_only" {
            continue;
        }
        let mut probe_settings = state.settings.clone();
        probe_settings.agent_runtime_mode = entry.id.clone();
        let probe = probe_active_runtime(&probe_settings);
        summaries.push(RuntimeProbeSummary {
            runtime_id: entry.id.clone(),
            runtime_label: entry.label.clone(),
            category: entry.category.clone(),
            binary_available: probe.binary_available,
            message: probe.message,
        });
    }
    Ok(summaries)
}

/// Smoke tests must not use the full sprint timeout (often 600s) or the UI looks frozen.
const SMOKE_TEST_TIMEOUT_SECS: u32 = 45;

#[tauri::command]
pub async fn test_agent_runtime(
    request: AgentRuntimeTestRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AgentRuntimeTestResult, String> {
    let prepared = {
        let state = state.lock().map_err(|e| e.to_string())?;
        if !crate::agent_runtime::is_subprocess_runtime(&state.settings.agent_runtime_mode) {
            return Ok(AgentRuntimeTestResult {
                ok: false,
                transport: None,
                preview: String::new(),
                message: "Set runtime mode to an external CLI subprocess first.".into(),
            });
        }
        let runtime_label = crate::agent_runtime::registry::effective_label(&state.settings);
        let _ = crate::agent_runtime::openclaw::resolve_openclaw_binary(&state.settings)?;

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
            let runtime_id = state.settings.agent_runtime_mode.clone();
            let task = WorkNode {
                id: format!("{runtime_id}-smoke-test"),
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
                awaiting_ceo_gate: false,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
                completed_at: None,
                queued_at: None,
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

        let mut settings = state.settings.clone();
        // Cap smoke-test wait so the UI never sits silent for 10 minutes.
        settings.openclaw_timeout_secs = settings
            .openclaw_timeout_secs
            .min(SMOKE_TEST_TIMEOUT_SECS)
            .max(15);

        let key_hint = if settings.agent_runtime_mode == "grok"
            && !settings.agent_runtime_allow_cli_env_keys
            && settings.grok_api_key.trim().is_empty()
        {
            " Tip: enable “Allow CLI to read stored API keys” or set XAI_API_KEY, and save a Grok key in Settings → AI."
        } else if settings.agent_runtime_mode == "grok"
            && !settings.agent_runtime_allow_cli_env_keys
            && !settings.grok_api_key.trim().is_empty()
        {
            " Tip: enable “Allow CLI to read stored API keys” so Grok CLI can use your Settings key."
        } else {
            ""
        };

        (
            settings,
            state.company_id.clone(),
            task,
            agent,
            project_title,
            workspace_root,
            runtime_label,
            key_hint.to_string(),
        )
    };

    let (settings, company_id, task, agent, project_title, workspace_root, runtime_label, key_hint) =
        prepared;

    let run_result = tokio::task::spawn_blocking(move || {
        run_openclaw_for_task(
            &settings,
            &company_id,
            &task,
            &agent,
            &project_title,
            workspace_root.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Runtime test task failed: {e}"))?;

    match run_result {
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
            Ok(AgentRuntimeTestResult {
                ok: true,
                transport: Some(transport.clone()),
                preview: preview.clone(),
                message: format!(
                    "{runtime_label} test succeeded via {transport} in {} ms. {preview}",
                    result.duration_ms
                ),
            })
        }
        Err(error) => Ok(AgentRuntimeTestResult {
            ok: false,
            transport: None,
            preview: String::new(),
            message: format!("{error}{key_hint}"),
        }),
    }
}

#[tauri::command]
pub async fn test_openclaw_runtime(
    request: OpenClawTestRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<OpenClawTestResult, String> {
    test_agent_runtime(request, state, app).await
}