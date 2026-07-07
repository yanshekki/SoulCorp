use crate::ai::{self, BilledChatRequest};
use crate::scrum::executor::build_execution_request;
use crate::scrum::types::WorkNode;
use crate::state::{AgentRecord, AppState};

pub fn execute_llm_only(
    state: &mut AppState,
    task: &WorkNode,
    agent: &AgentRecord,
    _project_title: &str,
) -> Result<String, String> {
    let request = build_execution_request(state, task, agent)?;
    let dept_providers = state.department_ai_providers.clone();
    let billed = BilledChatRequest {
        request,
        agent_id: agent.id.clone(),
        department: agent.department.clone(),
        source: "work_execution".to_string(),
    };
    ai::chat_with_fallback_billed(
        state,
        billed,
        &dept_providers,
        agent.ai_provider.as_deref(),
    )
    .map(|resp| resp.content)
}