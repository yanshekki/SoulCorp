use crate::agent_activity::{emit_step_complete, emit_step_start, ActivityRunContext};
use crate::ai::streaming::{chat_stream_billed, StreamContext};
use crate::ai::{self, BilledChatRequest};
use crate::scrum::executor::build_execution_request;
use crate::scrum::types::WorkNode;
use crate::state::{AgentRecord, AppState};

pub fn execute_llm_only(
    state: &mut AppState,
    task: &WorkNode,
    agent: &AgentRecord,
    _project_title: &str,
    activity: Option<ActivityRunContext>,
) -> Result<String, String> {
    let request = build_execution_request(state, task, agent)?;
    let dept_providers = state.department_ai_providers.clone();
    let billed = BilledChatRequest {
        request,
        agent_id: agent.id.clone(),
        department: agent.department.clone(),
        source: "work_execution".to_string(),
    };

    if let Some(ctx) = activity {
        emit_step_start(state, Some(&ctx.app), &ctx.session_id, &agent.id, "execute");
        let session_id = ctx.session_id.as_str();
        let mut stream_ctx = StreamContext {
            state,
            app: Some(&ctx.app),
            session_id,
            agent_id: &agent.id,
            step: Some("execute"),
        };
        let response = chat_stream_billed(
            &mut stream_ctx,
            billed,
            &dept_providers,
            agent.ai_provider.as_deref(),
        )?;
        emit_step_complete(
            stream_ctx.state,
            Some(&ctx.app),
            session_id,
            &agent.id,
            "execute",
            &response.content,
        );
        Ok(response.content)
    } else {
        ai::chat_with_fallback_billed(
            state,
            billed,
            &dept_providers,
            agent.ai_provider.as_deref(),
        )
        .map(|resp| resp.content)
    }
}