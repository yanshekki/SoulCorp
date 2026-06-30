use crate::ai::{self, provider::ChatRequest};
use crate::db::persistence::commit;
use crate::soul::build_system_prompt;
use crate::state::{AppState, InternalProject, MeetingMessage, MeetingState};
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
}

#[tauri::command]
pub fn start_meeting(
    request: StartMeetingRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<MeetingSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    if request.agent_ids.len() < 2 {
        return Err("Meetings require at least two agents.".to_string());
    }

    let meeting_id = Uuid::new_v4().to_string();
    let meeting = MeetingState {
        id: meeting_id.clone(),
        meeting_type: request.meeting_type.clone(),
        participant_ids: request.agent_ids.clone(),
        messages: Vec::new(),
        turn: 0,
        completed: false,
        morale_delta: morale_delta_for_type(&request.meeting_type),
        outcome_summary: None,
        project_progress_delta: 0.0,
        revenue_delta: 0.0,
    };

    for agent_id in &request.agent_ids {
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
    );
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn advance_meeting(
    meeting_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<MeetingSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    let provider = {
        let settings = state.settings.clone();
        let hub = state.hub.clone();
        ai::provider_for(&settings, &hub)
    };

    let (speaker_id, speaker, meeting_type, should_complete, morale_delta, participant_ids, history) = {
        let meeting = state
            .meetings
            .get(&meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?;

        if meeting.completed {
            return Ok(snapshot_from_meeting(meeting));
        }

        let turns_per_agent = 2;
        let should_complete =
            meeting.turn >= meeting.participant_ids.len() * turns_per_agent;
        let speaker_id = if should_complete {
            String::new()
        } else {
            meeting.participant_ids[meeting.turn % meeting.participant_ids.len()].clone()
        };

        let speaker = if should_complete {
            None
        } else {
            Some(
                state
                    .agents
                    .get(&speaker_id)
                    .ok_or_else(|| "Speaker not found.".to_string())?
                    .clone(),
            )
        };

        let history = meeting
            .messages
            .iter()
            .map(|message| format!("{}: {}", message.speaker_name, message.content))
            .collect::<Vec<_>>()
            .join("\n");

        (
            speaker_id,
            speaker,
            meeting.meeting_type.clone(),
            should_complete,
            meeting.morale_delta,
            meeting.participant_ids.clone(),
            history,
        )
    };

    if should_complete {
        let meeting_type_for_outcome = state
            .meetings
            .get(&meeting_id)
            .map(|meeting| meeting.meeting_type.clone())
            .ok_or_else(|| "Meeting not found.".to_string())?;

        {
            let meeting = state
                .meetings
                .get_mut(&meeting_id)
                .ok_or_else(|| "Meeting not found.".to_string())?;
            meeting.completed = true;
            let (progress_delta, revenue_delta, summary, spawn_project) =
                meeting_outcome_plan(&meeting_type_for_outcome);
            meeting.project_progress_delta = progress_delta;
            meeting.revenue_delta = revenue_delta;
            meeting.outcome_summary = Some(summary);
            if spawn_project {
                meeting.outcome_summary = Some(
                    "Strategy meeting created a new internal project and raised revenue outlook."
                        .to_string(),
                );
            }
        }

        apply_meeting_outcome_to_state(&mut state, &meeting_type_for_outcome);

        for agent_id in &participant_ids {
            if let Some(agent) = state.agents.get_mut(agent_id) {
                agent.morale = (agent.morale + morale_delta).min(1.0);
                agent.status = "idle".to_string();
            }
        }

        state.stats.meetings_completed += 1;

        let snapshot = snapshot_from_meeting(
            state
                .meetings
                .get(&meeting_id)
                .ok_or_else(|| "Meeting not found.".to_string())?,
        );
        commit(app, &state)?;
        return Ok(snapshot);
    }

    let speaker = speaker.ok_or_else(|| "Speaker not found.".to_string())?;

    if let Some(agent) = state.agents.get_mut(&speaker_id) {
        agent.status = "meeting".to_string();
    }

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

    let system_prompt = if let Some(soul) = &speaker.soul {
        build_system_prompt(
            soul,
            &format!(
                "meeting:{meeting_type}\nActive projects:\n{project_context}\nSpeak naturally in 2-4 sentences."
            ),
        )
    } else {
        format!(
            "You are {} from {} in a {} meeting.\nActive projects:\n{project_context}\nSpeak naturally in 2-4 sentences.",
            speaker.name, speaker.department, meeting_type
        )
    };

    let user_prompt = if history.is_empty() {
        format!(
            "{} opens the {} meeting with a concrete update about priorities.",
            speaker.name, meeting_type
        )
    } else {
        format!(
            "Meeting transcript so far:\n{history}\n\nNow {} continues the {} meeting with a specific response that references prior points.",
            speaker.name, meeting_type
        )
    };

    let response = ai::chat(
        provider.as_ref(),
        ChatRequest {
            system_prompt,
            user_prompt,
            temperature: 0.75,
        },
    )?;

    let meeting = state
        .meetings
        .get_mut(&meeting_id)
        .ok_or_else(|| "Meeting not found.".to_string())?;

    meeting.messages.push(MeetingMessage {
        speaker_id: speaker.id,
        speaker_name: speaker.name,
        content: response.content,
    });
    meeting.turn += 1;

    let snapshot = snapshot_from_meeting(meeting);
    commit(app, &state)?;
    Ok(snapshot)
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

    if let Some(project) = state.projects.first_mut() {
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

fn snapshot_from_meeting(meeting: &MeetingState) -> MeetingSnapshot {
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
    }
}