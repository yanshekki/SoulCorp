use crate::ai::{self, provider::ChatRequest, provider::ChatTurn, BilledChatRequest};
use crate::relationships::{relationship_label, upsert_relationship};
use crate::soul::build_chat_parts_for_agent;
use crate::state::{AppState, InternalProject, MeetingMessage, MeetingState};
use crate::workspace::write_meeting_notes_from_state;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomatedMeetingReport {
    pub meeting_id: String,
    pub meeting_type: String,
    pub turns_completed: u32,
    pub participant_count: u32,
    pub outcome_summary: String,
    pub messages: Vec<String>,
}

pub fn run_automated_meeting(
    state: &mut AppState,
    app: &AppHandle,
    meeting_type: &str,
    blocked_count: usize,
) -> Result<AutomatedMeetingReport, String> {
    let participant_ids = select_participants(state, blocked_count);
    if participant_ids.len() < 2 {
        return Err("Not enough agents available for an automated meeting.".to_string());
    }

    let meeting_id = Uuid::new_v4().to_string();
    let morale_delta = morale_delta_for_type(meeting_type);
    let meeting = MeetingState {
        id: meeting_id.clone(),
        meeting_type: meeting_type.to_string(),
        participant_ids: participant_ids.clone(),
        messages: Vec::new(),
        turn: 0,
        completed: false,
        morale_delta,
        outcome_summary: None,
        project_progress_delta: 0.0,
        revenue_delta: 0.0,
        notes_generated: false,
        notes_page_id: None,
        key_points: Vec::new(),
        decisions: Vec::new(),
        action_items: Vec::new(),
        risks_blockers: Vec::new(),
        notes_write_error: None,
        started_at: Some(chrono::Utc::now().to_rfc3339()),
        completed_at: None,
        story_id: None,
        task_ids: Vec::new(),
        directive_id: None,
    };

    for agent_id in &participant_ids {
        if let Some(agent) = state.agents.get_mut(agent_id) {
            agent.status = "meeting".to_string();
        }
    }
    state.meetings.insert(meeting_id.clone(), meeting);

    let turns_per_agent = state.settings.meeting_turns_per_agent.max(1) as usize;
    let max_turns = participant_ids.len() * turns_per_agent;
    let mut turns_completed = 0u32;

    while {
        let meeting = state
            .meetings
            .get(&meeting_id)
            .ok_or_else(|| "Meeting missing.".to_string())?;
        !meeting.completed && meeting.turn < max_turns
    } {
        let turn_plan = {
            let meeting = state
                .meetings
                .get(&meeting_id)
                .ok_or_else(|| "Meeting missing.".to_string())?;
            prepare_meeting_turn(state, meeting)?
        };

        let response = ai::chat_with_fallback_billed(
            state,
            BilledChatRequest {
                request: turn_plan.chat_request,
                agent_id: turn_plan.speaker_id.clone(),
                department: turn_plan.speaker_department,
                source: "automated_meeting".into(),
            },
            &turn_plan.department_ai_providers,
            turn_plan.speaker_ai_provider.as_deref(),
        )?;

        let meeting = state
            .meetings
            .get_mut(&meeting_id)
            .ok_or_else(|| "Meeting missing.".to_string())?;
        meeting.messages.push(MeetingMessage {
            speaker_id: turn_plan.speaker_id,
            speaker_name: turn_plan.speaker_name,
            content: response.content,
            provider: Some(response.provider),
        });
        meeting.turn += 1;
        turns_completed += 1;
    }

    let outcome_summary = finalize_meeting_sync(state, app, &meeting_id)?;

    Ok(AutomatedMeetingReport {
        meeting_id,
        meeting_type: meeting_type.to_string(),
        turns_completed,
        participant_count: participant_ids.len() as u32,
        outcome_summary: outcome_summary.clone(),
        messages: vec![format!(
            "Automated {meeting_type} with {} participants ({turns_completed} turns): {outcome_summary}",
            participant_ids.len()
        )],
    })
}

fn select_participants(state: &AppState, blocked_count: usize) -> Vec<String> {
    let mut ids = Vec::new();

    if let Some(co_ceo) = state.co_ceo.agent_id.clone() {
        if state.agents.contains_key(&co_ceo) {
            ids.push(co_ceo);
        }
    }

    if let Some(pm_id) = state.default_pm_agent_id.clone() {
        if state.agents.contains_key(&pm_id) && !ids.contains(&pm_id) {
            ids.push(pm_id);
        }
    } else if let Some(pm) = state
        .agents
        .values()
        .find(|a| {
            !crate::fate::is_system_agent(a)
                && (a.role.to_lowercase().contains("pm")
                    || a.role.to_lowercase().contains("project manager"))
        })
        .map(|a| a.id.clone())
    {
        if !ids.contains(&pm) {
            ids.push(pm);
        }
    }

    for node in &state.work_nodes {
        if node.status != crate::scrum::WorkNodeStatus::Blocked {
            continue;
        }
        if let Some(agent_id) = &node.assignee_agent_id {
            if state.agents.contains_key(agent_id) && !ids.contains(agent_id) {
                ids.push(agent_id.clone());
            }
        }
        if let Some(head) = crate::scrum::department_head_for(state, &node.department) {
            if !ids.contains(&head) {
                ids.push(head);
            }
        }
        if ids.len() >= 5 {
            break;
        }
    }

    if ids.len() < 2 || blocked_count >= 4 {
        for agent in state.agents.values() {
            if crate::fate::is_system_agent(agent) {
                continue;
            }
            if agent.manages_department.is_some() && !ids.contains(&agent.id) {
                ids.push(agent.id.clone());
            }
            if ids.len() >= 5 {
                break;
            }
        }
    }

    if ids.len() < 2 {
        for agent in state.agents.values() {
            if crate::fate::is_system_agent(agent) {
                continue;
            }
            if !ids.contains(&agent.id) {
                ids.push(agent.id.clone());
            }
            if ids.len() >= 4 {
                break;
            }
        }
    }

    ids.truncate(5);
    ids
}

struct MeetingTurnPlan {
    speaker_id: String,
    speaker_name: String,
    speaker_department: String,
    speaker_ai_provider: Option<String>,
    department_ai_providers: std::collections::HashMap<String, String>,
    chat_request: ChatRequest,
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
                format!("- {} ({}, {})", agent.name, agent.role, agent.department)
            })
        })
        .collect::<Vec<_>>()
        .join("\n");

    let relationship_context = relationship_context_for_participants(state, &meeting.participant_ids);
    let blocked_context = state
        .work_nodes
        .iter()
        .filter(|n| n.status == crate::scrum::WorkNodeStatus::Blocked)
        .map(|n| format!("- BLOCKED: {}", n.title))
        .collect::<Vec<_>>()
        .join("\n");

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

    let lang = crate::i18n::language_from_settings(&state.settings);
    let lang_block = crate::i18n::language_instruction(lang);
    let meet_lang = crate::i18n::meeting_language_instruction(lang);

    let meeting_context = format!(
        "{lang_block}\n\n{meet_lang}\n\n\
Company: {}\nMeeting type: {}\nParticipants:\n{roster}\nRelationships:\n{relationship_context}\nBlocked work:\n{blocked_context}\nActive projects:\n{project_context}\n\
Speak as this agent in the company language only (2–4 short sentences or bullets). Propose concrete next actions.",
        state.company_name, meeting.meeting_type
    );

    let (persona, context) = build_chat_parts_for_agent(
        speaker.soul.as_ref(),
        &speaker.name,
        &speaker.role,
        &speaker.department,
        &meeting_context,
    );

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
            "{meet_lang}\n\n\
{} opens the {} meeting with a concrete update about priorities and blockers. \
Speak only in the company language. No English meta-planning.",
            speaker.name, meeting.meeting_type
        )
    } else {
        format!(
            "{meet_lang}\n\n\
Meeting transcript so far:\n{history}\n\n\
Now {} continues the {} meeting with a specific response that references prior points and proposes next actions. \
Speak only in the company language. No English meta-planning.",
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
            system_prompt: format!("{lang_block}\n\n{meet_lang}\n\n{persona}"),
            context: Some(context),
            user_prompt,
            temperature: temperature_for_meeting(&meeting.meeting_type),
            soul_id: speaker.soul_id,
            conversation_turns,
        },
    })
}

fn finalize_meeting_sync(
    state: &mut AppState,
    app: &AppHandle,
    meeting_id: &str,
) -> Result<String, String> {
    let meeting_type = state
        .meetings
        .get(meeting_id)
        .map(|m| m.meeting_type.clone())
        .ok_or_else(|| "Meeting not found.".to_string())?;

    {
        let meeting = state
            .meetings
            .get_mut(meeting_id)
            .ok_or_else(|| "Meeting not found.".to_string())?;
        meeting.completed = true;
        let lang = crate::i18n::language_from_settings(&state.settings);
        let (progress_delta, revenue_delta, summary, spawn_project) =
            meeting_outcome_plan(lang, &meeting_type);
        meeting.project_progress_delta = progress_delta;
        meeting.revenue_delta = revenue_delta;
        meeting.outcome_summary = Some(if spawn_project {
            match lang {
                crate::i18n::AppLanguage::En => {
                    "Strategy meeting created a new internal project and raised revenue outlook."
                        .to_string()
                }
                crate::i18n::AppLanguage::ZhHant => {
                    "策略會議已建立新內部專案並提升收入展望。".to_string()
                }
                crate::i18n::AppLanguage::ZhHans => {
                    "策略会议已建立新内部项目并提升收入展望。".to_string()
                }
            }
        } else {
            summary
        });
    }

    let participant_ids = state
        .meetings
        .get(meeting_id)
        .map(|m| m.participant_ids.clone())
        .ok_or_else(|| "Meeting not found.".to_string())?;
    let morale_delta = state
        .meetings
        .get(meeting_id)
        .map(|m| m.morale_delta)
        .unwrap_or(0.05);

    let transcript: String = state
        .meetings
        .get(meeting_id)
        .map(|m| {
            m.messages
                .iter()
                .map(|msg| format!("{}: {}", msg.speaker_name, msg.content))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();

    let participant_names: Vec<String> = participant_ids
        .iter()
        .filter_map(|id| state.agents.get(id).map(|a| a.name.clone()))
        .collect();
    let lang = crate::i18n::language_from_settings(&state.settings);
    let canned = state
        .meetings
        .get(meeting_id)
        .and_then(|m| m.outcome_summary.clone())
        .unwrap_or_else(|| crate::i18n::meeting_canned_outcome(lang, &meeting_type));

    let settings = state.settings.clone();
    let hub = state.hub.clone();
    let depts = state.department_ai_providers.clone();
    let mut minutes = crate::meeting::build_minutes_heuristic(
        &meeting_type,
        &participant_names,
        &transcript,
        &canned,
        lang,
    );
    minutes = crate::meeting::polish_minutes_detached(
        &settings,
        &hub,
        &depts,
        None,
        "Executive",
        &transcript,
        minutes,
    );

    {
        if let Some(meeting) = state.meetings.get_mut(meeting_id) {
            meeting.outcome_summary = Some(minutes.outcome_summary.clone());
            meeting.key_points = minutes.key_points.clone();
            meeting.decisions = minutes.decisions.clone();
            meeting.action_items = minutes.action_items.clone();
            meeting.risks_blockers = minutes.risks_blockers.clone();
        }
    }

    let outcome_summary = minutes.outcome_summary.clone();
    let combined_outcome = if transcript.is_empty() {
        outcome_summary.clone()
    } else {
        format!("{outcome_summary}\n\nTranscript highlights:\n{transcript}")
    };

    apply_meeting_outcome_to_state(state, &meeting_type, &combined_outcome);
    apply_meeting_relationship_effects(state, &meeting_type, &participant_ids);

    for agent_id in &participant_ids {
        if let Some(agent) = state.agents.get_mut(agent_id) {
            agent.morale = (agent.morale + morale_delta).min(1.0);
            agent.status = "idle".to_string();
        }
    }

    state.stats.meetings_completed += 1;
    if let Err(error) = write_meeting_notes_from_state(app, state, meeting_id, Some(&minutes)) {
        crate::app_log::log_global(crate::app_log::LogLevel::Error, crate::app_log::LogCategory::Meeting, "auto_meeting_notes", format!("Failed to write automated meeting notes: {error}"), None);
    }

    Ok(outcome_summary)
}

fn apply_meeting_outcome_to_state(state: &mut AppState, meeting_type: &str, outcome_summary: &str) {
    let lang = crate::i18n::language_from_settings(&state.settings);
    let (progress_delta, revenue_delta, _, spawn_project) =
        meeting_outcome_plan(lang, meeting_type);

    if let Some(project) = state.projects.iter_mut().max_by(|left, right| {
        left.priority
            .cmp(&right.priority)
            .then(
                left.progress
                    .partial_cmp(&right.progress)
                    .unwrap_or(std::cmp::Ordering::Equal),
            )
    }) {
        project.progress = (project.progress + progress_delta).min(1.0);
    }

    let revenue_tokens = revenue_delta.round().max(0.0) as u64;
    state.token_economy.monthly_inflow_tokens = state
        .token_economy
        .monthly_inflow_tokens
        .saturating_add(revenue_tokens);
    let bonus = (revenue_delta * 0.25).round().max(0.0) as u64;
    crate::token_budget::top_up_company_tokens(state, bonus);

    crate::scrum::issue_meeting_directive_and_route(state, meeting_type, outcome_summary);

    if spawn_project && state.projects.len() < 6 {
        let pm_agent_id = state.default_pm_agent_id.clone();
        let (title, description) = crate::i18n::new_initiative_from_strategy(lang);
        state.projects.push(InternalProject {
            id: format!("proj-{}", Uuid::new_v4()),
            title,
            progress: 0.05,
            priority: 3,
            owner_department: "Executive".into(),
            description,
            pm_agent_id,
            active_sprint_id: None,
            default_cycle_days: 14,
        });
    }
}

fn meeting_outcome_plan(
    lang: crate::i18n::AppLanguage,
    meeting_type: &str,
) -> (f32, f64, String, bool) {
    let (progress, revenue, spawn) = match meeting_type {
        "Daily Standup" => (0.03, 0.0, false),
        "Project Kickoff" => (0.08, 120.0, false),
        "Crisis Meeting" => (0.02, -80.0, false),
        "Team Building" => (0.01, 0.0, false),
        "Strategy Discussion" => (0.05, 200.0, true),
        _ => (0.04, 50.0, false),
    };
    (
        progress,
        revenue,
        crate::i18n::meeting_canned_outcome(lang, meeting_type),
        spawn,
    )
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

fn temperature_for_meeting(meeting_type: &str) -> f32 {
    match meeting_type {
        "Crisis Meeting" => 0.55,
        "Strategy Discussion" => 0.8,
        "Team Building" => 0.85,
        _ => 0.75,
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