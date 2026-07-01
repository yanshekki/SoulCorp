use crate::state::{
    AgentRecord, AppState, GameEvent, GigContract, InternalProject, MeetingState, TokenEconomy,
};
use crate::workspace::models::LinkedEntity;
use crate::workspace::storage::{company_workspace_root, WorkspaceStorage};
use std::collections::HashMap;
use tauri::{AppHandle, Manager};

#[derive(Clone)]
pub struct ActivitySnapshot {
    pub company_id: String,
    pub day_number: u32,
    pub agents: Vec<AgentRecord>,
    pub projects: Vec<InternalProject>,
    pub meetings: HashMap<String, MeetingState>,
    pub gig_contracts: Vec<GigContract>,
    pub events: Vec<GameEvent>,
    pub token_economy: TokenEconomy,
}

impl ActivitySnapshot {
    pub fn from_state(state: &AppState) -> Self {
        Self {
            company_id: state.company_id.clone(),
            day_number: state.day_number,
            agents: state.agents.values().cloned().collect(),
            projects: state.projects.clone(),
            meetings: state.meetings.clone(),
            gig_contracts: state.gig_contracts.clone(),
            events: state.events.clone(),
            token_economy: state.token_economy.clone(),
        }
    }
}

pub fn write_daily_activity_docs(app: &AppHandle, snapshot: &ActivitySnapshot) -> Result<u32, String> {
    if snapshot.company_id.is_empty() {
        return Ok(0);
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = WorkspaceStorage::new(company_workspace_root(&dir, &snapshot.company_id))?;
    storage.ensure_seed()?;

    let day = snapshot.day_number;
    let agents = &snapshot.agents;

    for agent in agents {
        storage.ensure_agent_folder(&agent.id, &agent.name, &agent.department)?;
    }

    for agent in agents {
        let folder_id = format!("folder-{}", agent.id);
        let journal_title = format!("{} — Daily Journal", agent.name);
        let heading = format!("Day {day} Activity Log");
        let lines = activity_lines_for_agent(agent, snapshot);

        let page = storage.append_journal_entry(
            &folder_id,
            &journal_title,
            &heading,
            &lines,
            &agent.name,
        )?;
        storage.link_entity_to_page(
            &page.id,
            LinkedEntity {
                entity_type: "agent".to_string(),
                id: agent.id.clone(),
                title: agent.name.clone(),
            },
            &agent.name,
        )?;
        if let Some(project) = snapshot
            .projects
            .iter()
            .find(|project| project.owner_department == agent.department)
        {
            let _ = storage.link_entity_to_page(
                &page.id,
                LinkedEntity {
                    entity_type: "project".to_string(),
                    id: project.id.clone(),
                    title: project.title.clone(),
                },
                &agent.name,
            );
        }
    }
    let mut pages_written = agents.len() as u32;

    let summary = format!(
        "Payroll and operations logged for {} agents. Company pool {} tokens (total {}).",
        agents.len(),
        snapshot.token_economy.company_balance,
        crate::token_budget::total_company_tokens(&snapshot.token_economy)
    );
    storage.append_company_feed_entry(day, "Daily Operations", &summary)?;
    pages_written += 1;

    Ok(pages_written)
}

pub fn write_event_activity_doc(
    app: &AppHandle,
    snapshot: &ActivitySnapshot,
    event: &GameEvent,
) -> Result<u32, String> {
    if snapshot.company_id.is_empty() {
        return Ok(0);
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = WorkspaceStorage::new(company_workspace_root(&dir, &snapshot.company_id))?;
    storage.ensure_seed()?;

    let body = format!(
        "{} (morale {:+.0}%, cash ${:+.0})",
        event.description,
        event.morale_delta * 100.0,
        event.cash_delta
    );
    storage.append_company_feed_entry(snapshot.day_number, &event.title, &body)?;

    for agent in &snapshot.agents {
        storage.ensure_agent_folder(&agent.id, &agent.name, &agent.department)?;
    }

    for agent in &snapshot.agents {
        let folder_id = format!("folder-{}", agent.id);
        let journal_title = format!("{} — Daily Journal", agent.name);
        let heading = format!("Day {} — Event Response", snapshot.day_number);
        let lines = vec![
            format!("Company event: {}", event.title),
            format!("Personal impact: morale {:+.0}%", event.morale_delta * 100.0),
            reaction_line_for_agent(agent, event),
        ];
        storage.append_journal_entry(&folder_id, &journal_title, &heading, &lines, &agent.name)?;
    }

    Ok(1 + snapshot.agents.len() as u32)
}

pub fn write_meeting_notes_from_state(
    app: &AppHandle,
    state: &mut AppState,
    meeting_id: &str,
) -> Result<Vec<crate::workspace::models::WorkspacePage>, String> {
    if state
        .meetings
        .get(meeting_id)
        .map(|meeting| meeting.notes_generated)
        .unwrap_or(false)
    {
        return Ok(vec![]);
    }

    let (meeting_type, messages, participants) = {
        let meeting = state
            .meetings
            .get(meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?;

        let messages: Vec<(String, String)> = meeting
            .messages
            .iter()
            .map(|message| (message.speaker_name.clone(), message.content.clone()))
            .collect();

        let participants: Vec<(String, String, String)> = meeting
            .participant_ids
            .iter()
            .filter_map(|id| {
                state.agents.get(id).map(|agent| {
                    (
                        agent.id.clone(),
                        agent.name.clone(),
                        agent.department.clone(),
                    )
                })
            })
            .collect();

        (meeting.meeting_type.clone(), messages, participants)
    };

    if state.company_id.is_empty() {
        return Err("Create a company before generating meeting notes.".to_string());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = WorkspaceStorage::new(company_workspace_root(&dir, &state.company_id))?;
    storage.ensure_seed()?;
    let pages = storage.append_meeting_notes(meeting_id, &meeting_type, &messages, &participants)?;
    if let Some(meeting) = state.meetings.get_mut(meeting_id) {
        meeting.notes_generated = true;
    }
    state.stats.pages_created += pages.len() as u32;
    Ok(pages)
}

fn activity_lines_for_agent(agent: &AgentRecord, snapshot: &ActivitySnapshot) -> Vec<String> {
    let mut lines = Vec::new();

    match agent.status.as_str() {
        "meeting" => lines.push("Attended scheduled team meetings.".to_string()),
        "throttled" => {
            lines.push("Compute quota limited — documented blockers and queued smaller tasks.".to_string())
        }
        "inspired" => lines.push("Delivered high-creativity output during inspiration window.".to_string()),
        "working" => lines.push("Maintained focus blocks at assigned workstation.".to_string()),
        _ => lines.push("Started the day with planning and inbox triage.".to_string()),
    }

    for project in snapshot
        .projects
        .iter()
        .filter(|project| project.owner_department == agent.department)
    {
        lines.push(format!(
            "- Project \"{}\": {:.0}% complete (priority {})",
            project.title,
            project.progress * 100.0,
            project.priority
        ));
    }

    for meeting in snapshot.meetings.values() {
        if !meeting.participant_ids.contains(&agent.id) {
            continue;
        }
        let status = if meeting.completed {
            "completed"
        } else {
            "in progress"
        };
        lines.push(format!(
            "- Meeting \"{}\" ({}, {} turns)",
            meeting.meeting_type, status, meeting.turn
        ));
    }

    for contract in snapshot
        .gig_contracts
        .iter()
        .filter(|contract| contract.status != "completed")
    {
        lines.push(format!(
            "- Gig contract \"{}\": {} at {:.0}% progress",
            contract.title, contract.status, contract.progress * 100.0
        ));
    }

    if let Some(event) = snapshot.events.last() {
        lines.push(format!(
            "- Latest company event: \"{}\" ({})",
            event.title, event.tone
        ));
    }

    if agent.soul.is_some() {
        lines.push("- Soul profile loaded for persona-aligned responses.".to_string());
    }

    if agent.morale < 0.5 {
        lines.push("- Flagged morale dip and requested support from leadership.".to_string());
    }
    if agent.energy < 0.35 {
        lines.push("- Took recovery breaks to avoid burnout.".to_string());
    }

    lines.push(format!(
        "Status: {} · Morale {:.0}% · Energy {:.0}% · Salary ${:.0}/mo",
        agent.status,
        agent.morale * 100.0,
        agent.energy * 100.0,
        agent.salary
    ));

    lines
}

fn reaction_line_for_agent(agent: &AgentRecord, event: &GameEvent) -> String {
    match event.tone.as_str() {
        "positive" => format!(
            "{} noted the team should capitalize on \"{}\".",
            agent.name, event.title
        ),
        "negative" => format!(
            "{} proposed a mitigation plan after \"{}\".",
            agent.name, event.title
        ),
        _ => format!(
            "{} recorded observations about \"{}\" for follow-up.",
            agent.name, event.title
        ),
    }
}