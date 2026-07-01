use crate::ai::{self, provider::ChatRequest, provider::ChatTurn, MeetingAiStatus};
use crate::db::persistence::commit;
use crate::progress::ProgressReporter;
use crate::relationships::{relationship_label, upsert_relationship};
use crate::soul::build_system_prompt;
use crate::state::{AgentRecord, AppState, InternalProject, MeetingMessage, MeetingState};
use crate::workspace::write_meeting_notes_from_state;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartMeetingRequest {
    pub agent_ids: Vec<String>,
    pub meeting_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingSnapshot {
    pub id: String,
    pub meeting_type: String,
    pub participant_ids: Vec<String>,
    pub messages: Vec<MeetingMessage>,
    pub completed: bool,
    pub morale_delta: f32,
    pub outcome_summary: Option<String>,
    pub project_progress_delta: f32,
    pub revenue_delta: f64,
    pub active_provider: String,
    pub turns_per_agent: u32,
}

#[tauri::command]
pub fn get_active_meeting(
    state: State<'_, Mutex<AppState>>,
) -> Result<Option<MeetingSnapshot>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let ai_status = ai::probe_meeting_ai(&state.settings, &state.hub);
    let meeting = state
        .meetings
        .values()
        .find(|meeting| !meeting.completed);
    Ok(meeting.map(|meeting| {
        snapshot_from_meeting(meeting, &ai_status, state.settings.meeting_turns_per_agent)
    }))
}

#[tauri::command]
pub fn get_meeting_ai_status(state: State<'_, Mutex<AppState>>) -> Result<MeetingAiStatus, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(ai::probe_meeting_ai(&state.settings, &state.hub))
}

#[tauri::command]
pub fn start_meeting(
    request: StartMeetingRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<MeetingSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    let participant_ids: Vec<String> = request
        .agent_ids
        .iter()
        .filter(|agent_id| state.agents.contains_key(*agent_id))
        .cloned()
        .collect();
    if participant_ids.len() < 2 {
        return Err("Meetings require at least two valid agents.".to_string());
    }

    let meeting_id = Uuid::new_v4().to_string();
    let ai_status = ai::probe_meeting_ai(&state.settings, &state.hub);
    let meeting = MeetingState {
        id: meeting_id.clone(),
        meeting_type: request.meeting_type.clone(),
        participant_ids: participant_ids.clone(),
        messages: Vec::new(),
        turn: 0,
        completed: false,
        morale_delta: morale_delta_for_type(&request.meeting_type),
        outcome_summary: None,
        project_progress_delta: 0.0,
        revenue_delta: 0.0,
        notes_generated: false,
    };

    for agent_id in &participant_ids {
        if let Some(agent) = state.agents.get(agent_id) {
            if agent.status == "meeting" {
                return Err(format!("{} is already in a meeting.", agent.name));
            }
        }
    }

    for agent_id in &participant_ids {
        if let Some(agent) = state.agents.get_mut(agent_id) {
            agent.status = "meeting".to_string();
        }
    }

    state.meetings.insert(meeting_id.clone(), meeting);
    let snapshot = snapshot_from_meeting(
        state
            .meetings
            .get(&meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?,
        &ai_status,
        state.settings.meeting_turns_per_agent,
    );
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub async fn advance_meeting(
    meeting_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<MeetingSnapshot, String> {
    let (turn_plan, expected_turn, expected_completed) = {
        let state = state.lock().map_err(|e| e.to_string())?;
        let meeting = state
            .meetings
            .get(&meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?;

        if meeting.completed {
            let ai_status = ai::probe_meeting_ai(&state.settings, &state.hub);
            return Ok(snapshot_from_meeting(
                meeting,
                &ai_status,
                state.settings.meeting_turns_per_agent,
            ));
        }

        let expected_turn = meeting.turn;
        let expected_completed = meeting.completed;
        let turns_per_agent = state.settings.meeting_turns_per_agent.max(1);
        let should_complete =
            meeting.turn >= meeting.participant_ids.len() * turns_per_agent as usize;
        if should_complete {
            (None, expected_turn, expected_completed)
        } else {
            (
                Some(prepare_meeting_turn(&state, meeting)?),
                expected_turn,
                expected_completed,
            )
        }
    };

    if turn_plan.is_none() {
        return finalize_meeting(&meeting_id, state, app).await;
    }

    let turn_plan = turn_plan.expect("turn plan exists");
    let settings = turn_plan.settings.clone();
    let hub = turn_plan.hub.clone();
    let chat_request = turn_plan.chat_request;

    let department_providers = turn_plan.department_ai_providers.clone();
    let speaker_department = turn_plan.speaker_department.clone();
    let speaker_ai_provider = turn_plan.speaker_ai_provider.clone();
    let speaker_name = turn_plan.speaker_name.clone();
    let provider_label = speaker_ai_provider
        .clone()
        .unwrap_or_else(|| settings.ai_provider.clone());
    let progress = ProgressReporter::new(app.clone(), "meeting_advance");
    progress.emit_indeterminate(
        format!("Waiting for {speaker_name} · {provider_label}"),
        Some("llm"),
    );
    let response = tokio::task::spawn_blocking(move || {
        ai::chat_with_fallback(
            &settings,
            &hub,
            chat_request,
            &department_providers,
            &speaker_department,
            speaker_ai_provider.as_deref(),
        )
    })
    .await
    .map_err(|e| e.to_string())??;

    let mut state = state.lock().map_err(|e| e.to_string())?;
    let speaker_id = turn_plan.speaker_id.clone();
    let meeting_snapshot = {
        let meeting = state
            .meetings
            .get_mut(&meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?;
        if meeting.completed != expected_completed || meeting.turn != expected_turn {
            return Err(
                "Meeting advanced elsewhere while waiting for AI. Refresh and try again.".to_string(),
            );
        }
        meeting.messages.push(MeetingMessage {
            speaker_id: turn_plan.speaker_id,
            speaker_name: turn_plan.speaker_name,
            content: response.content,
            provider: Some(response.provider),
        });
        meeting.turn += 1;
        meeting.clone()
    };
    if let Some(agent) = state.agents.get_mut(&speaker_id) {
        agent.status = "meeting".to_string();
    }

    let settings = state.settings.clone();
    let hub = state.hub.clone();
    let turns_per_agent = settings.meeting_turns_per_agent;
    let (speaker_department, speaker_provider) = state
        .agents
        .get(&speaker_id)
        .map(|agent| {
            (
                agent.department.clone(),
                agent.ai_provider.as_deref().map(str::to_string),
            )
        })
        .unwrap_or_else(|| (String::new(), None));
    let department_providers = state.department_ai_providers.clone();
    let ai_status = ai::probe_agent_ai(
        &settings,
        &hub,
        &department_providers,
        &speaker_department,
        speaker_provider.as_deref(),
    );
    let snapshot = snapshot_from_meeting(&meeting_snapshot, &ai_status, turns_per_agent);
    commit(app, &state)?;
    progress.finish("Meeting turn complete");
    progress.clear();
    Ok(snapshot)
}

struct MeetingTurnPlan {
    speaker_id: String,
    speaker_name: String,
    speaker_department: String,
    speaker_ai_provider: Option<String>,
    department_ai_providers: std::collections::HashMap<String, String>,
    chat_request: ChatRequest,
    settings: crate::state::GameSettings,
    hub: crate::state::HubState,
}

fn prepare_meeting_turn(state: &AppState, meeting: &MeetingState) -> Result<MeetingTurnPlan, String> {
    let speaker_id = meeting.participant_ids[meeting.turn % meeting.participant_ids.len()].clone();
    let speaker = state
        .agents
        .get(&speaker_id)
        .ok_or_else(|| "Speaker not found.".to_string())?
        .clone();

    let roster = meeting
        .participant_ids
        .iter()
        .filter_map(|agent_id| {
            state.agents.get(agent_id).map(|agent| {
                format!(
                    "- {} ({}, {})",
                    agent.name, agent.role, agent.department
                )
            })
        })
        .collect::<Vec<_>>()
        .join("\n");

    let relationship_context = relationship_context_for_participants(state, &meeting.participant_ids);
    let project_context = state
        .projects
        .iter()
        .map(|project| {
            format!(
                "- {} ({:.0}% complete, priority {})",
                project.title,
                project.progress * 100.0,
                project.priority
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let meeting_context = format!(
        "Company: {}\nMeeting type: {}\nParticipants:\n{roster}\nRelationships:\n{relationship_context}\nActive projects:\n{project_context}\nSpeak naturally in 2-4 sentences. Reference teammates by name when useful.",
        state.company_name, meeting.meeting_type
    );

    let system_prompt = build_speaker_prompt(&speaker, &meeting_context);
    let conversation_turns: Vec<ChatTurn> = meeting
        .messages
        .iter()
        .map(|message| ChatTurn {
            role: if message.speaker_id == speaker.id {
                "assistant".to_string()
            } else {
                "user".to_string()
            },
            content: format!("{}: {}", message.speaker_name, message.content),
        })
        .collect();

    let history = meeting
        .messages
        .iter()
        .map(|message| format!("{}: {}", message.speaker_name, message.content))
        .collect::<Vec<_>>()
        .join("\n");

    let user_prompt = if history.is_empty() {
        format!(
            "{} opens the {} meeting with a concrete update about priorities and blockers.",
            speaker.name, meeting.meeting_type
        )
    } else {
        format!(
            "Meeting transcript so far:\n{history}\n\nNow {} continues the {} meeting with a specific response that references prior points and proposes next actions.",
            speaker.name, meeting.meeting_type
        )
    };

    Ok(MeetingTurnPlan {
        speaker_id: speaker.id.clone(),
        speaker_name: speaker.name.clone(),
        speaker_department: speaker.department.clone(),
        speaker_ai_provider: speaker.ai_provider.clone(),
        department_ai_providers: state.department_ai_providers.clone(),
        chat_request: ChatRequest {
            system_prompt,
            user_prompt,
            temperature: temperature_for_meeting(&meeting.meeting_type),
            soul_id: speaker.soul_id,
            conversation_turns,
        },
        settings: state.settings.clone(),
        hub: state.hub.clone(),
    })
}

async fn finalize_meeting(
    meeting_id: &str,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<MeetingSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    let meeting_type = state
        .meetings
        .get(meeting_id)
        .map(|meeting| meeting.meeting_type.clone())
        .ok_or_else(|| "Meeting not found.".to_string())?;

    {
        let meeting = state
            .meetings
            .get_mut(meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?;
        meeting.completed = true;
        let (progress_delta, revenue_delta, summary, spawn_project) =
            meeting_outcome_plan(&meeting_type);
        meeting.project_progress_delta = progress_delta;
        meeting.revenue_delta = revenue_delta;
        meeting.outcome_summary = Some(if spawn_project {
            "Strategy meeting created a new internal project and raised revenue outlook.".to_string()
        } else {
            summary
        });
    }

    let participant_ids = state
        .meetings
        .get(meeting_id)
        .map(|meeting| meeting.participant_ids.clone())
        .ok_or_else(|| "Meeting not found.".to_string())?;
    let morale_delta = state
        .meetings
        .get(meeting_id)
        .map(|meeting| meeting.morale_delta)
        .unwrap_or(0.05);

    apply_meeting_outcome_to_state(&mut state, &meeting_type);
    apply_meeting_relationship_effects(&mut state, &meeting_type, &participant_ids);

    for agent_id in &participant_ids {
        if let Some(agent) = state.agents.get_mut(agent_id) {
            agent.morale = (agent.morale + morale_delta).min(1.0);
            agent.status = "idle".to_string();
        }
    }

    state.stats.meetings_completed += 1;
    if let Err(error) = write_meeting_notes_from_state(&app, &mut state, meeting_id) {
        eprintln!("Failed to write meeting notes: {error}");
    }

    let ai_status = ai::probe_meeting_ai(&state.settings, &state.hub);
    let turns_per_agent = state.settings.meeting_turns_per_agent;
    let snapshot = snapshot_from_meeting(
        state
            .meetings
            .get(meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?,
        &ai_status,
        turns_per_agent,
    );
    commit(app, &state)?;
    Ok(snapshot)
}

fn build_speaker_prompt(speaker: &AgentRecord, meeting_context: &str) -> String {
    if let Some(soul) = &speaker.soul {
        build_system_prompt(soul, meeting_context)
    } else {
        format!(
            "You are {} ({}) from {} in SoulCorp.\n{meeting_context}",
            speaker.name, speaker.role, speaker.department
        )
    }
}

fn relationship_context_for_participants(state: &AppState, participant_ids: &[String]) -> String {
    let lines = state
        .agent_relationships
        .iter()
        .filter(|edge| {
            participant_ids.contains(&edge.from_agent_id)
                && participant_ids.contains(&edge.to_agent_id)
        })
        .filter_map(|edge| {
            let left = state.agents.get(&edge.from_agent_id)?;
            let right = state.agents.get(&edge.to_agent_id)?;
            Some(format!(
                "- {} ↔ {}: {} ({:.0}%)",
                left.name,
                right.name,
                relationship_label(&edge.relationship_type, edge.score),
                edge.score * 100.0
            ))
        })
        .collect::<Vec<_>>();

    if lines.is_empty() {
        "No strong relationship history yet.".to_string()
    } else {
        lines.join("\n")
    }
}

fn temperature_for_meeting(meeting_type: &str) -> f32 {
    match meeting_type {
        "Crisis Meeting" => 0.55,
        "Strategy Discussion" => 0.8,
        "Team Building" => 0.85,
        _ => 0.75,
    }
}

fn apply_meeting_relationship_effects(
    state: &mut AppState,
    meeting_type: &str,
    participant_ids: &[String],
) {
    if participant_ids.len() < 2 {
        return;
    }

    let delta = match meeting_type {
        "Team Building" => 0.08,
        "Crisis Meeting" => -0.04,
        "Strategy Discussion" => 0.05,
        _ => 0.03,
    };

    for left_index in 0..participant_ids.len() {
        for right_index in (left_index + 1)..participant_ids.len() {
            let left = &participant_ids[left_index];
            let right = &participant_ids[right_index];
            let current = state
                .agent_relationships
                .iter()
                .find(|edge| {
                    (edge.from_agent_id == *left || edge.from_agent_id == *right)
                        && (edge.to_agent_id == *left || edge.to_agent_id == *right)
                })
                .map(|edge| edge.score)
                .unwrap_or(0.45);
            let next = (current + delta).clamp(-1.0, 1.0);
            let relationship_type = if next >= 0.65 {
                "friend"
            } else if next < 0.25 {
                "tense"
            } else {
                "neutral"
            };
            upsert_relationship(state, left, right, relationship_type, next);
        }
    }
}

fn morale_delta_for_type(meeting_type: &str) -> f32 {
    match meeting_type {
        "Crisis Meeting" => -0.03,
        "Team Building" => 0.12,
        "Strategy Discussion" => 0.08,
        "Project Kickoff" => 0.06,
        _ => 0.05,
    }
}

fn meeting_outcome_plan(meeting_type: &str) -> (f32, f64, String, bool) {
    match meeting_type {
        "Daily Standup" => (
            0.03,
            0.0,
            "Standup aligned blockers and next actions.".to_string(),
            false,
        ),
        "Project Kickoff" => (
            0.08,
            120.0,
            "Kickoff boosted project momentum.".to_string(),
            false,
        ),
        "Crisis Meeting" => (
            0.02,
            -80.0,
            "Crisis response plan agreed under pressure.".to_string(),
            false,
        ),
        "Team Building" => (
            0.01,
            0.0,
            "Team building improved cross-team trust.".to_string(),
            false,
        ),
        "Strategy Discussion" => (
            0.05,
            200.0,
            "Strategy meeting unlocked a new initiative.".to_string(),
            true,
        ),
        _ => (
            0.04,
            50.0,
            "Meeting reached actionable consensus.".to_string(),
            false,
        ),
    }
}

fn apply_meeting_outcome_to_state(state: &mut AppState, meeting_type: &str) {
    let (progress_delta, revenue_delta, _, spawn_project) = meeting_outcome_plan(meeting_type);

    if let Some(project) = state
        .projects
        .iter_mut()
        .max_by(|left, right| {
            left.priority
                .cmp(&right.priority)
                .then(left.progress.partial_cmp(&right.progress).unwrap_or(std::cmp::Ordering::Equal))
        })
    {
        project.progress = (project.progress + progress_delta).min(1.0);
    }

    state.finance.monthly_revenue = (state.finance.monthly_revenue + revenue_delta).max(0.0);
    state.finance.cash_balance += revenue_delta * 0.25;

    if spawn_project && state.projects.len() < 6 {
        state.projects.push(InternalProject {
            id: format!("proj-{}", Uuid::new_v4()),
            title: "New initiative from strategy meeting".into(),
            progress: 0.05,
            priority: 3,
            owner_department: "Executive".into(),
        });
    }
}

fn snapshot_from_meeting(
    meeting: &MeetingState,
    ai_status: &MeetingAiStatus,
    turns_per_agent: u32,
) -> MeetingSnapshot {
    MeetingSnapshot {
        id: meeting.id.clone(),
        meeting_type: meeting.meeting_type.clone(),
        participant_ids: meeting.participant_ids.clone(),
        messages: meeting.messages.clone(),
        completed: meeting.completed,
        morale_delta: meeting.morale_delta,
        outcome_summary: meeting.outcome_summary.clone(),
        project_progress_delta: meeting.project_progress_delta,
        revenue_delta: meeting.revenue_delta,
        active_provider: ai_status.active_provider.clone(),
        turns_per_agent,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppState;

    #[test]
    fn builds_meeting_turn_with_relationship_context() {
        let mut state = AppState::default();
        state.seed_defaults();
        let meeting = MeetingState {
            id: "meet-1".into(),
            meeting_type: "Daily Standup".into(),
            participant_ids: vec!["agent-1".into(), "agent-2".into()],
            messages: Vec::new(),
            turn: 0,
            completed: false,
            morale_delta: 0.05,
            outcome_summary: None,
            project_progress_delta: 0.0,
            revenue_delta: 0.0,
            notes_generated: false,
        };

        let plan = prepare_meeting_turn(&state, &meeting).expect("meeting turn");
        assert!(plan.chat_request.system_prompt.contains("Mira"));
        assert!(plan.chat_request.system_prompt.contains("Relationships"));
    }
}