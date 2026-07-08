use super::emitter::now_iso;
use super::types::{
    ActivityKind, ActivitySource, AgentActivityEvent, AgentActivitySession, BrainLayer,
    SessionStatus,
};
use crate::scrum::types::{ExecutionStatus, WorkNodeStatus};
use crate::state::AppState;
use serde_json::json;
use uuid::Uuid;

pub fn backfill_if_needed(state: &mut AppState) {
    if state.agent_activity.backfill_done || state.company_id.is_empty() {
        return;
    }

    backfill_execution_runs(state);
    backfill_meetings(state);
    state.agent_activity.backfill_done = true;
}

fn backfill_execution_runs(state: &mut AppState) {
    for run in state.execution_runs.clone() {
        if state
            .agent_activity
            .events
            .iter()
            .any(|event| event.metadata.get("run_id").and_then(|v| v.as_str()) == Some(&run.id))
        {
            continue;
        }

        let agent_name = state
            .agents
            .get(&run.agent_id)
            .map(|agent| agent.name.clone())
            .unwrap_or_else(|| run.agent_id.clone());

        let task_title = state
            .work_nodes
            .iter()
            .find(|node| node.id == run.work_node_id)
            .map(|node| node.title.clone());

        let (brain_label, transport) = state
            .agents
            .get(&run.agent_id)
            .map(|agent| super::emitter::resolve_brain_labels(state, agent, BrainLayer::Execution))
            .unwrap_or_else(|| ("Unknown".to_string(), "llm_only".to_string()));

        let session_id = format!("sess-backfill-{}", Uuid::new_v4());
        let status = match run.status {
            ExecutionStatus::Running | ExecutionStatus::Queued => SessionStatus::Active,
            ExecutionStatus::Succeeded => SessionStatus::Completed,
            ExecutionStatus::Failed | ExecutionStatus::Throttled => SessionStatus::Failed,
        };

        state.agent_activity.sessions.push(AgentActivitySession {
            id: session_id.clone(),
            agent_id: run.agent_id.clone(),
            agent_name,
            source: ActivitySource::Execution,
            brain_layer: BrainLayer::Execution,
            brain_label,
            transport,
            work_node_id: Some(run.work_node_id.clone()),
            work_node_title: task_title,
            meeting_id: None,
            run_id: Some(run.id.clone()),
            status,
            started_at: if run.started_at.is_empty() {
                now_iso()
            } else {
                run.started_at.clone()
            },
            finished_at: run.finished_at.clone(),
        });

        state.agent_activity.events.push(AgentActivityEvent {
            id: format!("act-backfill-{}", Uuid::new_v4()),
            session_id: session_id.clone(),
            agent_id: run.agent_id.clone(),
            kind: ActivityKind::SessionStart,
            timestamp: run.started_at.clone(),
            step: None,
            content_delta: None,
            content_full: Some("Backfilled execution session".to_string()),
            metadata: json!({ "run_id": run.id, "backfill": true }),
        });

        if !run.summary.is_empty() {
            state.agent_activity.events.push(AgentActivityEvent {
                id: format!("act-backfill-{}", Uuid::new_v4()),
                session_id: session_id.clone(),
                agent_id: run.agent_id.clone(),
                kind: ActivityKind::StepComplete,
                timestamp: run.finished_at.clone().unwrap_or_else(now_iso),
                step: Some("output".to_string()),
                content_delta: None,
                content_full: Some(run.summary.clone()),
                metadata: json!({ "run_id": run.id, "provider": run.provider, "backfill": true }),
            });
        }

        if let Some(error) = run.error.clone() {
            state.agent_activity.events.push(AgentActivityEvent {
                id: format!("act-backfill-{}", Uuid::new_v4()),
                session_id: session_id.clone(),
                agent_id: run.agent_id,
                kind: ActivityKind::Error,
                timestamp: run.finished_at.clone().unwrap_or_else(now_iso),
                step: None,
                content_delta: None,
                content_full: Some(error),
                metadata: json!({ "run_id": run.id, "backfill": true }),
            });
        }
    }
}

fn backfill_meetings(state: &mut AppState) {
    for meeting in state.meetings.values() {
        for (index, message) in meeting.messages.iter().enumerate() {
            let session_id = format!("meeting-{}-{}", meeting.id, message.speaker_id);
            if state
                .agent_activity
                .events
                .iter()
                .any(|event| {
                    event.session_id == session_id
                        && event.kind == ActivityKind::StepComplete
                        && event.step.as_deref() == Some(&format!("turn_{index}"))
                })
            {
                continue;
            }

            let (brain_label, transport) = state
                .agents
                .get(&message.speaker_id)
                .map(|agent| super::emitter::resolve_brain_labels(state, agent, BrainLayer::Meeting))
                .unwrap_or_else(|| {
                    (
                        message.provider.clone().unwrap_or_else(|| "meeting".to_string()),
                        "api".to_string(),
                    )
                });

            if !state.agent_activity.sessions.iter().any(|s| s.id == session_id) {
                state.agent_activity.sessions.push(AgentActivitySession {
                    id: session_id.clone(),
                    agent_id: message.speaker_id.clone(),
                    agent_name: message.speaker_name.clone(),
                    source: ActivitySource::Meeting,
                    brain_layer: BrainLayer::Meeting,
                    brain_label,
                    transport,
                    work_node_id: None,
                    work_node_title: None,
                    meeting_id: Some(meeting.id.clone()),
                    run_id: None,
                    status: if meeting.completed {
                        SessionStatus::Completed
                    } else {
                        SessionStatus::Active
                    },
                    started_at: now_iso(),
                    finished_at: None,
                });
            }

            state.agent_activity.events.push(AgentActivityEvent {
                id: format!("act-backfill-{}", Uuid::new_v4()),
                session_id,
                agent_id: message.speaker_id.clone(),
                kind: ActivityKind::StepComplete,
                timestamp: now_iso(),
                step: Some(format!("turn_{index}")),
                content_delta: None,
                content_full: Some(message.content.clone()),
                metadata: json!({
                    "provider": message.provider,
                    "meeting_id": meeting.id,
                    "backfill": true
                }),
            });
        }
    }
}

pub fn current_task_for_agent(state: &AppState, agent_id: &str) -> Option<(String, String)> {
    state
        .work_nodes
        .iter()
        .find(|node| {
            node.assignee_agent_id.as_deref() == Some(agent_id)
                && matches!(
                    node.status,
                    WorkNodeStatus::InProgress | WorkNodeStatus::InReview
                )
        })
        .map(|node| (node.id.clone(), node.title.clone()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scrum::types::{ExecutionRun, ExecutionStatus};

    #[test]
    fn backfill_creates_events_from_execution_runs() {
        let mut state = AppState::default();
        state.company_id = "co-1".to_string();
        state.execution_runs.push(ExecutionRun {
            id: "exec-1".to_string(),
            work_node_id: "task-1".to_string(),
            agent_id: "agent-1".to_string(),
            status: ExecutionStatus::Succeeded,
            provider: "llm".to_string(),
            estimated_tokens: 10,
            actual_tokens: 10,
            deliverable_page_id: None,
            summary: "Done".to_string(),
            error: None,
            started_at: "2026-01-01T00:00:00Z".to_string(),
            finished_at: Some("2026-01-01T00:01:00Z".to_string()),
        });
        backfill_if_needed(&mut state);
        assert!(state.agent_activity.backfill_done);
        assert!(!state.agent_activity.events.is_empty());
    }
}