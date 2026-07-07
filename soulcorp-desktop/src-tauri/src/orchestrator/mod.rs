//! Company-level strategic loop: auto briefings, directives, and escalation meetings.

use crate::ai::{self, provider::ChatRequest, BilledChatRequest};
use crate::commands::tier::ensure_agent_capacity;
use crate::meeting::run_automated_meeting;
use crate::scrum::{issue_co_ceo_directive, types::DirectiveStatus, types::WorkNodeStatus};
use crate::soul::parse_soul_content;
use crate::state::{AgentRecord, AppState};
use crate::token_budget::total_company_tokens;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestratorReport {
    pub directives_issued: u32,
    pub meetings_triggered: u32,
    pub messages: Vec<String>,
}

pub fn apply_orchestrator_tick(
    state: &mut AppState,
    app: &AppHandle,
    force: bool,
) -> OrchestratorReport {
    let mut report = OrchestratorReport {
        directives_issued: 0,
        meetings_triggered: 0,
        messages: Vec::new(),
    };

    if !state.settings.orchestrator_enabled || state.company_id.is_empty() {
        return report;
    }

    if state.settings.scrum_execution_paused {
        return report;
    }

    if total_company_tokens(&state.token_economy) < state.settings.scrum_min_tokens_guard {
        return report;
    }

    let now = Utc::now();
    if !force && !orchestrator_interval_elapsed(state, now) {
        return report;
    }

    let open_directives = state
        .directives
        .iter()
        .filter(|d| {
            matches!(
                d.status,
                DirectiveStatus::Open | DirectiveStatus::Routed | DirectiveStatus::Executing
            )
        })
        .count();

    let blocked_tasks = state
        .work_nodes
        .iter()
        .filter(|n| n.status == WorkNodeStatus::Blocked)
        .count();

    let should_issue =
        open_directives == 0 || (blocked_tasks >= 2 && open_directives <= 1);

    if !should_issue && !force {
        return report;
    }

    state.orchestrator.last_tick_at = Some(now.to_rfc3339());

    if state.settings.orchestrator_auto_meeting && blocked_tasks >= 2 {
        try_auto_meeting(state, app, blocked_tasks, &mut report);
    }

    if open_directives > 0 && blocked_tasks < 2 {
        report
            .messages
            .push("Orchestrator waiting for open directives to clear.".into());
        push_orchestrator_log(state, &report.messages);
        return report;
    }

    ensure_co_ceo_spawned(state, &mut report);

    let max_directives = state.settings.orchestrator_max_directives_per_cycle.max(1);
    let directives = generate_directives(state);

    for directive in directives.into_iter().take(max_directives as usize) {
        match issue_co_ceo_directive(
            state,
            &directive.title,
            &directive.description,
            &directive.target_department,
        ) {
            Ok(issued) => {
                report.directives_issued += 1;
                state.co_ceo.last_directive = Some(issued.title.clone());
                state.co_ceo.directives_applied += 1;
                report.messages.push(format!(
                    "Orchestrator issued directive: {}",
                    issued.title
                ));
            }
            Err(err) => report.messages.push(format!("Directive issue failed: {err}")),
        }
    }

    if report.directives_issued > 0 {
        state.co_ceo.last_briefing_at = Some(now.to_rfc3339());
        state.orchestrator.directives_issued_total += report.directives_issued;
    }

    push_orchestrator_log(state, &report.messages);
    report
}

fn orchestrator_interval_secs(state: &AppState) -> i64 {
    let blocked_tasks = state
        .work_nodes
        .iter()
        .filter(|n| n.status == WorkNodeStatus::Blocked)
        .count();
    let pending_work = state.work_nodes.iter().any(|n| {
        !matches!(
            n.status,
            WorkNodeStatus::Done | WorkNodeStatus::Blocked
        )
    });

    if blocked_tasks >= 2 {
        state.settings.orchestrator_urgent_interval_secs.max(60) as i64
    } else if !pending_work {
        state.settings.orchestrator_idle_interval_secs.max(60) as i64
    } else {
        state.settings.orchestrator_interval_secs.max(60) as i64
    }
}

fn orchestrator_interval_elapsed(state: &AppState, now: DateTime<Utc>) -> bool {
    let interval = orchestrator_interval_secs(state);
    let Some(last) = state.orchestrator.last_tick_at.as_deref() else {
        return true;
    };
    let Ok(parsed) = DateTime::parse_from_rfc3339(last) else {
        return true;
    };
    (now - parsed.with_timezone(&Utc)).num_seconds() >= interval
}

fn try_auto_meeting(
    state: &mut AppState,
    app: &AppHandle,
    blocked_count: usize,
    report: &mut OrchestratorReport,
) -> bool {
    let has_active = state.meetings.values().any(|m| !m.completed);
    if has_active {
        return false;
    }

    let meeting_type = if blocked_count >= 4 {
        "Crisis Meeting"
    } else if blocked_count >= 2 {
        "Strategy Discussion"
    } else {
        "Project Kickoff"
    };

    match run_automated_meeting(state, app, meeting_type, blocked_count) {
        Ok(meeting_report) => {
            report.meetings_triggered += 1;
            report.messages.extend(meeting_report.messages);
            state.orchestrator.meetings_triggered += 1;
            true
        }
        Err(err) => {
            report
                .messages
                .push(format!("Automated meeting skipped: {err}"));
            false
        }
    }
}

struct PlannedDirective {
    title: String,
    description: String,
    target_department: String,
}

fn generate_directives(state: &mut AppState) -> Vec<PlannedDirective> {
    let use_llm =
        !state.settings.pure_local_mode && state.settings.ai_provider != "mock";

    if use_llm {
        if let Some(co_ceo_id) = state.co_ceo.agent_id.clone() {
            if let Ok(directives) = run_briefing_sync(state, &co_ceo_id) {
                return directives;
            }
        }
    }

    rule_based_directives(state)
}

fn run_briefing_sync(state: &mut AppState, co_ceo_id: &str) -> Result<Vec<PlannedDirective>, String> {
    let co_ceo = state
        .agents
        .get(co_ceo_id)
        .cloned()
        .ok_or_else(|| "Co-CEO missing.".to_string())?;

    let context = build_company_snapshot_prompt(state);
    let departments = crate::departments::department_names(state);

    let request = ChatRequest {
        system_prompt: format!(
            "You are Aria Nexus, the AI Co-CEO of {}. Produce an executive briefing with exactly 3 numbered directives. Each directive must name a department and a concrete action.",
            state.company_name
        ),
        user_prompt: context,
        temperature: 0.65,
        soul_id: None,
        context: None,
        conversation_turns: Vec::new(),
    };

    let dept_providers = state.department_ai_providers.clone();
    let co_ceo_department = co_ceo.department.clone();
    let co_ceo_provider = co_ceo.ai_provider.clone();
    let response = ai::chat_with_fallback_billed(
        state,
        BilledChatRequest {
            request,
            agent_id: co_ceo_id.to_string(),
            department: co_ceo_department,
            source: "orchestrator_briefing".into(),
        },
        &dept_providers,
        co_ceo_provider.as_deref(),
    )?;

    Ok(parse_numbered_directives(&response.content, &departments))
}

fn rule_based_directives(state: &AppState) -> Vec<PlannedDirective> {
    let departments = crate::departments::department_names(state);
    let fallback = departments
        .first()
        .cloned()
        .unwrap_or_else(|| "Engineering".to_string());

    let project = state
        .projects
        .iter()
        .min_by(|a, b| {
            a.priority
                .cmp(&b.priority)
                .then(a.progress.partial_cmp(&b.progress).unwrap_or(std::cmp::Ordering::Equal))
        });

    let vision_hint = if state.company_vision.trim().is_empty() {
        String::new()
    } else {
        format!(" Align with company vision: {}.", state.company_vision.trim())
    };

    let Some(project) = project else {
        return vec![PlannedDirective {
            title: "Define company roadmap".into(),
            description: format!(
                "Create the first internal project and assign a PM.{vision_hint}"
            ),
            target_department: fallback,
        }];
    };

    vec![PlannedDirective {
        title: format!("Advance {}", project.title),
        description: format!(
            "Push {} toward delivery. Current progress {:.0}%. Owner department: {}.{}",
            project.title,
            project.progress * 100.0,
            project.owner_department,
            vision_hint
        ),
        target_department: project.owner_department.clone(),
    }]
}

fn build_company_snapshot_prompt(state: &AppState) -> String {
    let roster = state
        .agents
        .values()
        .filter(|a| !crate::fate::is_system_agent(a))
        .map(|a| format!("- {} ({}, {})", a.name, a.role, a.department))
        .collect::<Vec<_>>()
        .join("\n");

    let projects = state
        .projects
        .iter()
        .map(|p| {
            format!(
                "- {} [{}] {:.0}%",
                p.title,
                p.owner_department,
                p.progress * 100.0
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let tagline = state.company_tagline.trim();
    let vision = state.company_vision.trim();
    let strategy = match (tagline.is_empty(), vision.is_empty()) {
        (true, true) => "Strategy: Not yet defined.".to_string(),
        (false, true) => format!("Tagline: {tagline}"),
        (true, false) => format!("Vision: {vision}"),
        (false, false) => format!("Tagline: {tagline}\nVision: {vision}"),
    };

    format!(
        "Company snapshot for {company}:\n{strategy}\nAgents:\n{roster}\nProjects:\n{projects}\n\nProvide today's executive briefing and 3 directives aligned with the company vision.",
        company = state.company_name,
        strategy = strategy,
        roster = if roster.is_empty() { "None".into() } else { roster },
        projects = if projects.is_empty() {
            "None".into()
        } else {
            projects
        }
    )
}

fn parse_numbered_directives(content: &str, departments: &[String]) -> Vec<PlannedDirective> {
    let fallback = departments
        .first()
        .cloned()
        .unwrap_or_else(|| "Executive".to_string());

    let mut directives = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let looks_numbered = trimmed
            .chars()
            .next()
            .map(|ch| ch.is_ascii_digit())
            .unwrap_or(false)
            || trimmed.starts_with('-');
        if !looks_numbered {
            continue;
        }

        let title = trimmed
            .trim_start_matches(|ch: char| !ch.is_alphabetic())
            .split([':', '.', '–', '-'])
            .next()
            .unwrap_or("Strategic directive")
            .trim()
            .to_string();
        if title.len() < 4 {
            continue;
        }

        let target_department = departments
            .iter()
            .find(|d| trimmed.to_lowercase().contains(&d.to_lowercase()))
            .cloned()
            .unwrap_or_else(|| fallback.clone());

        directives.push(PlannedDirective {
            title: title.clone(),
            description: trimmed.to_string(),
            target_department,
        });
        if directives.len() == 3 {
            break;
        }
    }

    if directives.is_empty() {
        directives.push(PlannedDirective {
            title: "Focus the core roadmap".into(),
            description: content.to_string(),
            target_department: fallback,
        });
    }
    directives
}

fn ensure_co_ceo_spawned(state: &mut AppState, report: &mut OrchestratorReport) {
    if !state.settings.orchestrator_auto_spawn_co_ceo {
        return;
    }

    if let Some(agent_id) = state.co_ceo.agent_id.clone() {
        if state.agents.contains_key(&agent_id) {
            return;
        }
    }

    if ensure_agent_capacity(state).is_err() {
        report.messages.push("Co-CEO spawn skipped: agent capacity.".into());
        return;
    }

    let agent_id = "agent-co-ceo".to_string();
    let soul = parse_soul_content(
        "# Aria Nexus\n\n## Personality\nStrategic, calm, and decisive.\n\n## Values\nLong-term growth, team leverage, and clarity.\n\n## Communication Style\nExecutive briefings with concrete next steps.",
    )
    .ok();

    let record = AgentRecord {
        id: agent_id.clone(),
        name: "Aria Nexus".to_string(),
        role: "AI Co-CEO".to_string(),
        department: "Executive".to_string(),
        morale: 0.92,
        energy: 0.95,
        salary: 6800.0,
        status: "working".to_string(),
        soul,
        soul_id: None,
        ai_provider: None,
        agent_kind: None,
        skills: crate::state::skills_for_role("AI Co-CEO"),
        reports_to: None,
        manages_department: Some("Executive".to_string()),
    };

    state.agents.insert(agent_id.clone(), record);
    state.co_ceo.agent_id = Some(agent_id);
    if crate::config::is_v2() {
        state.co_ceo.autonomy_enabled = true;
    }
    report.messages.push("Orchestrator spawned AI Co-CEO.".into());
}

fn push_orchestrator_log(state: &mut AppState, messages: &[String]) {
    for msg in messages {
        state.orchestrator.recent_log.push(msg.clone());
    }
    while state.orchestrator.recent_log.len() > 20 {
        state.orchestrator.recent_log.remove(0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_numbered_lines() {
        let content = "1. Engineering: Ship onboarding.\n2. Marketing: Launch campaign.";
        let departments = vec!["Engineering".into(), "Marketing".into()];
        let parsed = parse_numbered_directives(content, &departments);
        assert!(!parsed.is_empty());
    }

}