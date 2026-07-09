use super::{gates_deliverables, gates_directives};
use crate::agent_activity::{emit_autopilot_phase_change, ActivitySource};
use crate::scrum::types::{
    DirectiveStatus, ExecutionStatus, WorkNodeKind, WorkNodeStatus,
};
use crate::scrum::worker::WorkerTickReport;
use crate::state::{AppState, AutopilotIntervention};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

pub const STALL_TICK_THRESHOLD: u32 = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AutopilotPhase {
    Bootstrap,
    Briefing,
    Aligning,
    Planning,
    Documenting,
    Scheduling,
    Executing,
    Reviewing,
    Delivered,
    Growing,
    Stalled,
}

impl AutopilotPhase {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Bootstrap => "bootstrap",
            Self::Briefing => "briefing",
            Self::Aligning => "aligning",
            Self::Planning => "planning",
            Self::Documenting => "documenting",
            Self::Scheduling => "scheduling",
            Self::Executing => "executing",
            Self::Reviewing => "reviewing",
            Self::Delivered => "delivered",
            Self::Growing => "growing",
            Self::Stalled => "stalled",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Bootstrap => "Bootstrap",
            Self::Briefing => "Briefing",
            Self::Aligning => "Aligning",
            Self::Planning => "Planning",
            Self::Documenting => "Documenting",
            Self::Scheduling => "Scheduling",
            Self::Executing => "Executing",
            Self::Reviewing => "Reviewing",
            Self::Delivered => "Delivered",
            Self::Growing => "Growing",
            Self::Stalled => "Stalled",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutopilotPhaseCounts {
    pub open_directives: u32,
    pub stories_without_brief: u32,
    pub unassigned_tasks: u32,
    pub in_progress_tasks: u32,
    pub in_review_tasks: u32,
    pub done_tasks: u32,
    pub active_executions: u32,
    pub active_agents: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutopilotPipelineStep {
    pub phase: String,
    pub label: String,
    pub count: u32,
    pub active: bool,
    pub last_action_at: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PendingGateKind {
    Directive,
    Deliverable,
    MeetingSummary,
    StoryBrief,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingGate {
    pub id: String,
    pub kind: PendingGateKind,
    pub title: String,
    pub detail: String,
    pub created_at: String,
    #[serde(default)]
    pub workspace_page_id: Option<String>,
    #[serde(default)]
    pub work_node_id: Option<String>,
    #[serde(default)]
    pub directive_id: Option<String>,
    #[serde(default)]
    pub meeting_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutopilotSnapshot {
    pub phase: String,
    pub phase_label: String,
    pub stall_reason: Option<String>,
    pub intervention_mode: String,
    pub worker_enabled: bool,
    pub execution_paused: bool,
    pub readiness_ready: bool,
    pub next_action: String,
    pub last_worker_tick_at: Option<String>,
    pub last_orchestrator_tick_at: Option<String>,
    pub counts: AutopilotPhaseCounts,
    pub pipeline_steps: Vec<AutopilotPipelineStep>,
    pub pending_gates: Vec<PendingGate>,
    pub recent_interventions: Vec<AutopilotIntervention>,
    pub deliverables_this_week: u32,
    pub gigs_advanced_this_week: u32,
    pub updated_at: String,
}

pub fn detect_phase(state: &AppState) -> AutopilotPhase {
    if state.company_id.is_empty() || !state.onboarding_completed {
        return AutopilotPhase::Bootstrap;
    }

    if state.autopilot.stall_tick_count >= STALL_TICK_THRESHOLD {
        return AutopilotPhase::Stalled;
    }

    let active_meeting = state.meetings.values().any(|m| !m.completed);
    if active_meeting {
        return AutopilotPhase::Aligning;
    }

    let open_directives = state.directives.iter().any(|d| {
        matches!(
            d.status,
            DirectiveStatus::Open | DirectiveStatus::Routed | DirectiveStatus::Executing
        )
    });
    let gated_directives = state
        .directives
        .iter()
        .any(|d| d.awaiting_ceo_gate && d.status == DirectiveStatus::Open);

    if gated_directives || state.directives.is_empty() && state.work_nodes.is_empty() {
        return AutopilotPhase::Briefing;
    }

    if open_directives {
        return AutopilotPhase::Planning;
    }

    let stories_without_brief = state.work_nodes.iter().any(|n| {
        n.kind == WorkNodeKind::Story
            && n.linked_workspace_page_id.is_none()
            && !matches!(n.status, WorkNodeStatus::Done | WorkNodeStatus::Blocked)
    });
    if stories_without_brief {
        return AutopilotPhase::Documenting;
    }

    let unassigned = state.work_nodes.iter().any(|n| {
        n.kind == WorkNodeKind::Task
            && n.assignee_agent_id.is_none()
            && matches!(
                n.status,
                WorkNodeStatus::Backlog | WorkNodeStatus::Ready | WorkNodeStatus::InSprint
            )
    });
    if unassigned {
        return AutopilotPhase::Scheduling;
    }

    let in_review = state.work_nodes.iter().any(|n| n.status == WorkNodeStatus::InReview);
    if in_review {
        return AutopilotPhase::Reviewing;
    }

    let executing = state.work_nodes.iter().any(|n| n.status == WorkNodeStatus::InProgress)
        || state.execution_runs.iter().any(|r| r.status == ExecutionStatus::Running);
    if executing {
        return AutopilotPhase::Executing;
    }

    let active_gigs = state
        .gig_contracts
        .iter()
        .any(|c| c.status == "in_progress" || c.status == "accepted");
    if active_gigs {
        return AutopilotPhase::Growing;
    }

    let recent_done = state.work_nodes.iter().any(|n| {
        n.kind == WorkNodeKind::Task && n.status == WorkNodeStatus::Done
    });
    if recent_done && !open_directives {
        return AutopilotPhase::Delivered;
    }

    AutopilotPhase::Briefing
}

fn compute_counts(state: &AppState) -> AutopilotPhaseCounts {
    let open_directives = state
        .directives
        .iter()
        .filter(|d| {
            matches!(
                d.status,
                DirectiveStatus::Open | DirectiveStatus::Routed | DirectiveStatus::Executing
            )
        })
        .count() as u32;

    let stories_without_brief = state
        .work_nodes
        .iter()
        .filter(|n| {
            n.kind == WorkNodeKind::Story
                && n.linked_workspace_page_id.is_none()
                && !matches!(n.status, WorkNodeStatus::Done | WorkNodeStatus::Blocked)
        })
        .count() as u32;

    let unassigned_tasks = state
        .work_nodes
        .iter()
        .filter(|n| {
            n.kind == WorkNodeKind::Task
                && n.assignee_agent_id.is_none()
                && matches!(
                    n.status,
                    WorkNodeStatus::Backlog | WorkNodeStatus::Ready | WorkNodeStatus::InSprint
                )
        })
        .count() as u32;

    let in_progress_tasks = state
        .work_nodes
        .iter()
        .filter(|n| n.status == WorkNodeStatus::InProgress)
        .count() as u32;

    let in_review_tasks = state
        .work_nodes
        .iter()
        .filter(|n| n.status == WorkNodeStatus::InReview)
        .count() as u32;

    let done_tasks = state
        .work_nodes
        .iter()
        .filter(|n| n.kind == WorkNodeKind::Task && n.status == WorkNodeStatus::Done)
        .count() as u32;

    let active_executions = state
        .execution_runs
        .iter()
        .filter(|r| r.status == ExecutionStatus::Running)
        .count() as u32;

    let active_agents = state
        .agents
        .values()
        .filter(|a| !crate::fate::is_system_agent(a) && a.status == "working")
        .count() as u32;

    AutopilotPhaseCounts {
        open_directives,
        stories_without_brief,
        unassigned_tasks,
        in_progress_tasks,
        in_review_tasks,
        done_tasks,
        active_executions,
        active_agents,
    }
}

fn compute_pending_gates(state: &AppState) -> Vec<PendingGate> {
    let mut gates = Vec::new();

    for directive in &state.directives {
        if directive.awaiting_ceo_gate && directive.status == DirectiveStatus::Open {
            gates.push(PendingGate {
                id: format!("gate-dir-{}", directive.id),
                kind: PendingGateKind::Directive,
                title: directive.title.clone(),
                detail: directive.description.clone(),
                created_at: directive.created_at.clone(),
                workspace_page_id: None,
                work_node_id: None,
                directive_id: Some(directive.id.clone()),
                meeting_id: None,
            });
        }
    }

    for node in &state.work_nodes {
        if node.kind == WorkNodeKind::Task && node.status == WorkNodeStatus::InReview {
            if gates_deliverables(state) || node.awaiting_ceo_gate {
                gates.push(PendingGate {
                    id: format!("gate-del-{}", node.id),
                    kind: PendingGateKind::Deliverable,
                    title: node.title.clone(),
                    detail: "Deliverable awaiting CEO approval.".into(),
                    created_at: node.updated_at.clone(),
                    workspace_page_id: node.linked_workspace_page_id.clone(),
                    work_node_id: Some(node.id.clone()),
                    directive_id: None,
                    meeting_id: None,
                });
            }
        }
        if node.kind == WorkNodeKind::Story
            && node.linked_workspace_page_id.is_none()
            && !matches!(node.status, WorkNodeStatus::Done | WorkNodeStatus::Blocked)
        {
            gates.push(PendingGate {
                id: format!("gate-brief-{}", node.id),
                kind: PendingGateKind::StoryBrief,
                title: node.title.clone(),
                detail: "Autopilot is preparing the story brief page.".into(),
                created_at: node.created_at.clone(),
                workspace_page_id: None,
                work_node_id: Some(node.id.clone()),
                directive_id: None,
                meeting_id: None,
            });
        }
    }

    for (meeting_id, meeting) in &state.meetings {
        if meeting.completed
            && meeting.outcome_summary.is_some()
            && !state.autopilot.dismissed_meeting_ids.contains(meeting_id)
        {
            gates.push(PendingGate {
                id: format!("gate-meet-{}", meeting_id),
                kind: PendingGateKind::MeetingSummary,
                title: meeting.meeting_type.clone(),
                detail: meeting
                    .outcome_summary
                    .clone()
                    .unwrap_or_default(),
                created_at: Utc::now().to_rfc3339(),
                workspace_page_id: None,
                work_node_id: None,
                directive_id: None,
                meeting_id: Some(meeting_id.clone()),
            });
        }
    }

    gates
}

fn pipeline_steps(phase: AutopilotPhase, counts: &AutopilotPhaseCounts) -> Vec<AutopilotPipelineStep> {
    let phases = [
        (AutopilotPhase::Briefing, counts.open_directives),
        (AutopilotPhase::Aligning, 0),
        (AutopilotPhase::Planning, counts.open_directives),
        (AutopilotPhase::Documenting, counts.stories_without_brief),
        (AutopilotPhase::Scheduling, counts.unassigned_tasks),
        (AutopilotPhase::Executing, counts.in_progress_tasks + counts.active_executions),
        (AutopilotPhase::Reviewing, counts.in_review_tasks),
        (AutopilotPhase::Delivered, counts.done_tasks),
        (AutopilotPhase::Growing, 0),
    ];

    phases
        .into_iter()
        .map(|(p, count)| AutopilotPipelineStep {
            phase: p.as_str().to_string(),
            label: p.label().to_string(),
            count,
            active: p == phase,
            last_action_at: None,
        })
        .collect()
}

fn next_action_hint(phase: AutopilotPhase, state: &AppState) -> String {
    if state.settings.scrum_execution_paused {
        return "Autopilot paused — resume in Command Center.".into();
    }
    if !state.settings.scrum_worker_enabled {
        return "Enable background worker to run autopilot.".into();
    }
    match phase {
        AutopilotPhase::Bootstrap => "Complete onboarding to start autopilot.".into(),
        AutopilotPhase::Briefing => "Co-CEO will issue the next strategic directive.".into(),
        AutopilotPhase::Aligning => "Automated meeting in progress.".into(),
        AutopilotPhase::Planning => "Routing directives into backlog stories.".into(),
        AutopilotPhase::Documenting => "Creating Workspace brief pages for stories.".into(),
        AutopilotPhase::Scheduling => "Assigning tasks to agents and planning sprint.".into(),
        AutopilotPhase::Executing => "Agents executing tasks and writing deliverables.".into(),
        AutopilotPhase::Reviewing => {
            if gates_deliverables(state) {
                "Deliverables awaiting your approval.".into()
            } else {
                "PM reviewing deliverables against acceptance criteria.".into()
            }
        }
        AutopilotPhase::Delivered => "Cycle complete — orchestrator will plan next directive.".into(),
        AutopilotPhase::Growing => "Advancing marketplace gigs from completed work.".into(),
        AutopilotPhase::Stalled => "Pipeline stalled — forcing orchestrator briefing.".into(),
    }
}

fn stall_reason(state: &AppState, phase: AutopilotPhase) -> Option<String> {
    if phase != AutopilotPhase::Stalled {
        return None;
    }
    Some(format!(
        "No progress for {} worker ticks.",
        state.autopilot.stall_tick_count
    ))
}

pub fn compute_autopilot_snapshot(state: &AppState) -> AutopilotSnapshot {
    let phase = detect_phase(state);
    let counts = compute_counts(state);
    let readiness = crate::operations::compute_automation_readiness(state);

    AutopilotSnapshot {
        phase: phase.as_str().to_string(),
        phase_label: phase.label().to_string(),
        stall_reason: stall_reason(state, phase),
        intervention_mode: state.settings.autopilot_intervention_mode.clone(),
        worker_enabled: state.settings.scrum_worker_enabled,
        execution_paused: state.settings.scrum_execution_paused,
        readiness_ready: readiness.ready,
        next_action: next_action_hint(phase, state),
        last_worker_tick_at: state.scrum_worker.last_tick_at.clone(),
        last_orchestrator_tick_at: state.orchestrator.last_tick_at.clone(),
        counts,
        pipeline_steps: pipeline_steps(phase, &compute_counts(state)),
        pending_gates: compute_pending_gates(state),
        recent_interventions: state.autopilot.recent_interventions.clone(),
        deliverables_this_week: state.autopilot.deliverables_this_week,
        gigs_advanced_this_week: state.autopilot.gigs_advanced_this_week,
        updated_at: Utc::now().to_rfc3339(),
    }
}

pub fn after_worker_tick(
    state: &mut AppState,
    app: &AppHandle,
    report: &WorkerTickReport,
    force_orchestrator: bool,
) {
    let made_progress = report.routed > 0
        || report.planned > 0
        || report.executed > 0
        || report.approved > 0
        || report.orchestrated > 0
        || report.meetings > 0
        || force_orchestrator;

    if made_progress {
        state.autopilot.stall_tick_count = 0;
        state.autopilot.last_progress_at = Some(report.timestamp.clone());
        if report.approved > 0 {
            state.autopilot.deliverables_this_week += report.approved;
        }
        if report.gigs_completed > 0 {
            state.autopilot.gigs_advanced_this_week += report.gigs_completed;
        }
    } else if state.settings.scrum_worker_enabled && !state.settings.scrum_execution_paused {
        state.autopilot.stall_tick_count = state.autopilot.stall_tick_count.saturating_add(1);
    }

    let phase = detect_phase(state);
    let phase_str = phase.as_str().to_string();
    if state.autopilot.current_phase != phase_str {
        let previous = state.autopilot.current_phase.clone();
        state.autopilot.current_phase = phase_str.clone();
        state.autopilot.last_phase_change_at = Some(Utc::now().to_rfc3339());
        emit_autopilot_phase_change(
            state,
            Some(app),
            &previous,
            &phase_str,
            ActivitySource::Worker,
        );
    }

    state.autopilot.last_snapshot_at = Some(Utc::now().to_rfc3339());
}