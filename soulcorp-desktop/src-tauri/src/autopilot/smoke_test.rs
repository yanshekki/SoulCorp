//! Autopilot acceptance smoke tests (plan success criteria, offline).

#[cfg(test)]
mod tests {
    use super::super::{compute_autopilot_snapshot, detect_phase, AutopilotPhase};
    use crate::scrum::command_center::issue_directive_record;
    use crate::scrum::scheduler::{ensure_active_sprint, plan_sprint, route_directive_rule_based};
    use crate::scrum::types::{DirectiveSource, DirectiveTarget, WorkNodeKind};
    use crate::state::{fresh_company_state, AgentRecord, AppState, InternalProject, PlayMode};

    fn staffed_local_state() -> AppState {
        let mut state = fresh_company_state(
            "Smoke Corp",
            "Software",
            "Ship fast",
            PlayMode::Work,
            true,
            false,
            0.0,
        );
        state.onboarding_completed = true;
        state.company_vision = "Deliver one product per sprint.".into();
        state.projects.push(InternalProject {
            id: "proj-smoke".into(),
            title: "Launch MVP".into(),
            progress: 0.0,
            priority: 1,
            owner_department: "Engineering".into(),
            description: String::new(),
            pm_agent_id: None,
            active_sprint_id: None,
            default_cycle_days: 14,
        });
        state.agents.insert(
            "agent-eng-1".into(),
            AgentRecord {
                id: "agent-eng-1".into(),
                name: "Alex".into(),
                role: "Engineer".into(),
                department: "Engineering".into(),
                morale: 0.8,
                energy: 0.9,
                salary: 4000.0,
                status: "idle".into(),
                soul: None,
                soul_id: None,
                ai_provider: None,
                agent_runtime_mode: None,
                agent_kind: None,
                skills: vec!["rust".into()],
                reports_to: None,
                manages_department: None,
            },
        );
        state.default_pm_agent_id = Some("agent-eng-1".into());
        state.settings.scrum_worker_enabled = true;
        state.settings.orchestrator_enabled = true;
        state.settings.scrum_auto_route = true;
        state.settings.scrum_auto_schedule = true;
        state.settings.scrum_auto_execute = true;
        state.settings.scrum_auto_approve = true;
        state.settings.scrum_execution_paused = false;
        state.settings.pure_local_mode = true;
        state.settings.ai_provider = "mock".into();
        state.token_economy.company_balance = 50_000;
        state
    }

    #[test]
    fn cold_start_issues_directive_and_routes_story() {
        let mut state = staffed_local_state();
        assert!(state.directives.is_empty());

        let directive = issue_directive_record(
            &mut state,
            "Ship onboarding".into(),
            "Deliver first user-facing increment.".into(),
            DirectiveSource::CoCeo,
            DirectiveTarget::Project,
            "proj-smoke".into(),
        );
        let nodes =
            route_directive_rule_based(&mut state, &directive.id, "proj-smoke").expect("route");
        assert!(!nodes.is_empty());
        assert!(state.work_nodes.iter().any(|n| n.kind == WorkNodeKind::Story));
        let story = state
            .work_nodes
            .iter()
            .find(|n| n.kind == WorkNodeKind::Story)
            .expect("story");
        assert!(story.acceptance_criteria.len() >= 2);
    }

    #[test]
    fn auto_schedule_plans_tasks_without_manual_run() {
        let mut state = staffed_local_state();
        let directive = issue_directive_record(
            &mut state,
            "Advance MVP".into(),
            "Complete one shippable task.".into(),
            DirectiveSource::CoCeo,
            DirectiveTarget::Project,
            "proj-smoke".into(),
        );
        let _ = route_directive_rule_based(&mut state, &directive.id, "proj-smoke");
        let sprint_id = ensure_active_sprint(&mut state, "proj-smoke").expect("sprint");
        let planned = plan_sprint(&mut state, &sprint_id).expect("plan");
        assert!(planned > 0 || !state.work_nodes.is_empty());

        let snapshot = compute_autopilot_snapshot(&state);
        assert!(!snapshot.phase.is_empty());
        let phase = detect_phase(&state);
        assert!(!matches!(phase, AutopilotPhase::Bootstrap));
    }

    #[test]
    fn intervention_records_ceo_actions() {
        let mut state = staffed_local_state();
        let directive = issue_directive_record(
            &mut state,
            "Gated directive".into(),
            "Needs CEO approval.".into(),
            DirectiveSource::CoCeo,
            DirectiveTarget::Project,
            "proj-smoke".into(),
        );
        if let Some(d) = state.directives.iter_mut().find(|d| d.id == directive.id) {
            d.awaiting_ceo_gate = true;
        }

        super::super::ceo_approve_directive(&mut state, &directive.id).expect("approve");
        assert!(!state.directives[0].awaiting_ceo_gate);
        assert!(!state.autopilot.recent_interventions.is_empty());
    }

    #[test]
    fn snapshot_exposes_pending_gates_and_phase() {
        let mut state = staffed_local_state();
        let directive = issue_directive_record(
            &mut state,
            "Review me".into(),
            "Gate test.".into(),
            DirectiveSource::CoCeo,
            DirectiveTarget::Project,
            "proj-smoke".into(),
        );
        if let Some(d) = state.directives.iter_mut().find(|d| d.id == directive.id) {
            d.awaiting_ceo_gate = true;
        }
        state.settings.autopilot_intervention_mode = "gate_directives".into();

        let snapshot = compute_autopilot_snapshot(&state);
        assert!(
            snapshot
                .pending_gates
                .iter()
                .any(|g| g.directive_id.as_deref() == Some(&directive.id))
        );
        let phase = detect_phase(&state);
        assert!(matches!(
            phase,
            AutopilotPhase::Briefing | AutopilotPhase::Planning
        ));
    }
}