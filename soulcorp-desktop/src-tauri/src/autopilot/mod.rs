mod bootstrap;
pub mod brief_pages;
mod interventions;
mod snapshot;

#[cfg(test)]
mod smoke_test;

pub use bootstrap::bootstrap_first_cycle;
pub use brief_pages::ensure_story_brief_pages;
pub use interventions::{
    approve_deliverable_with_gate, ceo_approve_directive, ceo_comment_on_item, ceo_edit_directive,
    ceo_reject_deliverable, ceo_reject_directive, ceo_reroute_story, ceo_update_story_criteria,
    dismiss_meeting_gate, meeting_follow_up_directive, record_intervention,
};
pub use crate::state::AutopilotIntervention;
pub use snapshot::{
    after_worker_tick, compute_autopilot_snapshot, detect_phase, AutopilotPhase,
    AutopilotPhaseCounts, AutopilotPipelineStep, AutopilotSnapshot, PendingGate,
    PendingGateKind, STALL_TICK_THRESHOLD,
};

pub fn gates_directives(state: &crate::state::AppState) -> bool {
    state.settings.autopilot_intervention_mode == "gate_directives"
}

pub fn gates_deliverables(state: &crate::state::AppState) -> bool {
    state.settings.autopilot_intervention_mode == "gate_deliverables"
}

pub fn apply_autopilot_runtime_defaults(state: &mut crate::state::AppState) {
    let staffed_agents = state
        .agents
        .values()
        .filter(|a| !crate::fate::is_system_agent(a))
        .count();
    let pool = crate::token_budget::total_company_tokens(&state.token_economy);
    let tokens_ok = pool >= state.settings.scrum_min_tokens_guard;
    if staffed_agents >= 2 && tokens_ok {
        state.settings.scrum_parallel_agents = true;
    }
    if state.settings.autopilot_intervention_mode == "paused" {
        state.settings.scrum_execution_paused = true;
    }
}

pub fn apply_full_autopilot_settings(state: &mut crate::state::AppState, enabled: bool) {
    state.settings.autopilot_full_auto_enabled = enabled;
    if enabled {
        state.settings.scrum_worker_enabled = true;
        state.settings.orchestrator_enabled = true;
        state.settings.scrum_auto_route = true;
        state.settings.scrum_auto_schedule = true;
        state.settings.scrum_auto_execute = true;
        state.settings.scrum_auto_approve = true;
        state.settings.scrum_auto_retry_blocked = true;
        state.settings.orchestrator_auto_meeting = true;
        state.settings.scrum_execution_paused = false;
        // Leave CEO gate modes so PM auto-approve and execute keep flowing.
        state.settings.autopilot_intervention_mode = "auto".to_string();
        apply_autopilot_runtime_defaults(state);
    }
}