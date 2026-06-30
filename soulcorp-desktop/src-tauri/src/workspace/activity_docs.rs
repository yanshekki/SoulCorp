use crate::state::{AgentRecord, AppState, GameEvent};
use crate::workspace::models::WorkspacePage;
use crate::workspace::storage::{workspace_root, WorkspaceStorage};
use rand::Rng;
use tauri::{AppHandle, Manager};

pub fn write_daily_activity_docs(app: &AppHandle, state: &mut AppState) -> Result<u32, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = WorkspaceStorage::new(workspace_root(&dir))?;
    storage.ensure_seed()?;

    let mut pages_written = 0u32;
    let day = state.day_number;
    let agents: Vec<AgentRecord> = state.agents.values().cloned().collect();

    for agent in &agents {
        let folder_id = storage.ensure_agent_folder(&agent.id, &agent.name)?;
        let journal_title = format!("{} — Daily Journal", agent.name);
        let heading = format!("Day {day} Activity Log");
        let lines = activity_lines_for_agent(agent, state);

        storage.append_journal_entry(&folder_id, &journal_title, &heading, &lines, &agent.name)?;
        pages_written += 1;
    }

    let summary = format!(
        "Payroll and operations logged for {} agents. Cash ${:.0}, compute {:.0} tokens.",
        agents.len(),
        state.finance.cash_balance,
        state.finance.compute_tokens
    );
    storage.append_company_feed_entry(day, "Daily Operations", &summary)?;
    pages_written += 1;

    state.stats.pages_created += pages_written;
    Ok(pages_written)
}

pub fn write_event_activity_doc(
    app: &AppHandle,
    state: &mut AppState,
    event: &GameEvent,
) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = WorkspaceStorage::new(workspace_root(&dir))?;
    storage.ensure_seed()?;

    let body = format!(
        "{} (morale {:+.0}%, cash ${:+.0})",
        event.description,
        event.morale_delta * 100.0,
        event.cash_delta
    );
    storage.append_company_feed_entry(state.day_number, &event.title, &body)?;

    for agent in state.agents.values() {
        let folder_id = storage.ensure_agent_folder(&agent.id, &agent.name)?;
        let journal_title = format!("{} — Daily Journal", agent.name);
        let heading = format!("Day {} — Event Response", state.day_number);
        let lines = vec![
            format!("Company event: {}", event.title),
            format!("Personal impact: morale {:+.0}%", event.morale_delta * 100.0),
            reaction_line_for_agent(agent, event),
        ];
        storage.append_journal_entry(&folder_id, &journal_title, &heading, &lines, &agent.name)?;
    }

    state.stats.pages_created += 1 + state.agents.len() as u32;
    Ok(())
}

pub fn write_meeting_notes_from_state(
    app: &AppHandle,
    state: &mut AppState,
    meeting_id: &str,
) -> Result<Vec<WorkspacePage>, String> {
    if state
        .meetings
        .get(meeting_id)
        .map(|meeting| meeting.notes_generated)
        .unwrap_or(false)
    {
        return Ok(vec![]);
    }

    let (meeting_type, messages, participant_names) = {
        let meeting = state
            .meetings
            .get(meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?;

        let messages: Vec<(String, String)> = meeting
            .messages
            .iter()
            .map(|message| (message.speaker_name.clone(), message.content.clone()))
            .collect();

        let participant_names: Vec<String> = meeting
            .participant_ids
            .iter()
            .filter_map(|id| state.agents.get(id).map(|agent| agent.name.clone()))
            .collect();

        (meeting.meeting_type.clone(), messages, participant_names)
    };

    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let storage = WorkspaceStorage::new(workspace_root(&dir))?;
    storage.ensure_seed()?;
    let pages = storage.append_meeting_notes(&meeting_type, &messages, &participant_names)?;
    if let Some(meeting) = state.meetings.get_mut(meeting_id) {
        meeting.notes_generated = true;
    }
    state.stats.pages_created += pages.len() as u32;
    Ok(pages)
}

fn activity_lines_for_agent(agent: &AgentRecord, state: &AppState) -> Vec<String> {
    let mut rng = rand::rng();
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

    let dept_tasks = department_tasks(&agent.department);
    lines.push(format!(
        "- {}",
        dept_tasks[rng.random_range(0..dept_tasks.len())]
    ));
    lines.push(format!(
        "- {}",
        dept_tasks[rng.random_range(0..dept_tasks.len())]
    ));

    if let Some(project) = state
        .projects
        .iter()
        .find(|project| project.owner_department == agent.department)
    {
        lines.push(format!(
            "- Updated \"{}\" progress to {:.0}%",
            project.title,
            project.progress * 100.0
        ));
    }

    if agent.morale < 0.5 {
        lines.push("- Flagged morale dip and requested support from leadership.".to_string());
    }
    if agent.energy < 0.35 {
        lines.push("- Took recovery breaks to avoid burnout.".to_string());
    }

    lines.push(format!(
        "Status: {} · Morale {:.0}% · Energy {:.0}%",
        agent.status,
        agent.morale * 100.0,
        agent.energy * 100.0
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

fn department_tasks(department: &str) -> Vec<&'static str> {
    match department {
        "Engineering" => vec![
            "Refactored service boundaries for the core platform",
            "Reviewed pull requests and unblocked integration tests",
            "Paired on performance profiling for hot paths",
            "Drafted API contract updates for the next sprint",
        ],
        "Human Resources" => vec![
            "Updated onboarding checklist for new hires",
            "Scheduled 1:1 check-ins across departments",
            "Drafted culture pulse survey questions",
            "Reviewed compensation bands against market data",
        ],
        "Executive" => vec![
            "Reviewed quarterly targets with department leads",
            "Prioritized portfolio bets for the next month",
            "Aligned roadmap trade-offs with finance constraints",
            "Prepared board-ready operating metrics summary",
        ],
        "Marketplace" => vec![
            "Screened new Soul profiles for recruitment pipeline",
            "Updated gig pricing guidance on the hub board",
            "Synced candidate shortlist with hiring managers",
        ],
        _ => vec![
            "Completed assigned deliverables on schedule",
            "Updated shared project tracker with blockers",
            "Coordinated handoffs with adjacent teams",
        ],
    }
    .into_iter()
    .collect()
}