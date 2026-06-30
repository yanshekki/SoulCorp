use crate::ai::{self, provider::ChatRequest};
use crate::soul::build_system_prompt;
use crate::state::{AppState, MeetingMessage, MeetingState};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
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
}

#[tauri::command]
pub fn start_meeting(
    request: StartMeetingRequest,
    state: State<'_, Mutex<AppState>>,
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
        morale_delta: 0.05,
    };

    state.meetings.insert(meeting_id.clone(), meeting);
    Ok(snapshot_from_meeting(
        state
            .meetings
            .get(&meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?,
    ))
}

#[tauri::command]
pub fn advance_meeting(
    meeting_id: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<MeetingSnapshot, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    let provider = ai::default_provider();

    let (speaker_id, speaker, meeting_type, should_complete, morale_delta, participant_ids) = {
        let meeting = state
            .meetings
            .get(&meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?;

        if meeting.completed {
            return Ok(snapshot_from_meeting(meeting));
        }

        let should_complete = meeting.turn >= meeting.participant_ids.len() * 2;
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

        (
            speaker_id,
            speaker,
            meeting.meeting_type.clone(),
            should_complete,
            meeting.morale_delta,
            meeting.participant_ids.clone(),
        )
    };

    if should_complete {
        let meeting = state
            .meetings
            .get_mut(&meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?;
        meeting.completed = true;

        for agent_id in &participant_ids {
            if let Some(agent) = state.agents.get_mut(agent_id) {
                agent.morale = (agent.morale + morale_delta).min(1.0);
                agent.status = "idle".to_string();
            }
        }

        return Ok(snapshot_from_meeting(
            state
                .meetings
                .get(&meeting_id)
                .ok_or_else(|| "Meeting not found.".to_string())?,
        ));
    }

    let speaker = speaker.ok_or_else(|| "Speaker not found.".to_string())?;

    if let Some(agent) = state.agents.get_mut(&speaker_id) {
        agent.status = "meeting".to_string();
    }

    let system_prompt = if let Some(soul) = &speaker.soul {
        build_system_prompt(soul, &format!("meeting:{meeting_type}"))
    } else {
        format!(
            "You are {} from {} in a {} meeting.",
            speaker.name, speaker.department, meeting_type
        )
    };

    let user_prompt = format!(
        "{} shares an update about current priorities in the {} meeting.",
        speaker.name, meeting_type
    );

    let response = ai::chat(
        provider.as_ref(),
        ChatRequest {
            system_prompt,
            user_prompt,
            temperature: 0.7,
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

    Ok(snapshot_from_meeting(meeting))
}

fn snapshot_from_meeting(meeting: &MeetingState) -> MeetingSnapshot {
    MeetingSnapshot {
        id: meeting.id.clone(),
        meeting_type: meeting.meeting_type.clone(),
        participant_ids: meeting.participant_ids.clone(),
        messages: meeting.messages.clone(),
        completed: meeting.completed,
        morale_delta: meeting.morale_delta,
    }
}
