#[cfg(test)]
mod tests {
    use super::super::executor::{retry_blocked_tasks, update_directive_lifecycle};
    use super::super::org::seed_default_org_links;
    use super::super::pm_review::approve_deliverable_core;
    use super::super::types::{
        Directive, DirectiveSource, DirectiveStatus, DirectiveTarget, WorkNode, WorkNodeKind,
        WorkNodeStatus,
    };
    use crate::state::AppState;

    fn sample_task(status: WorkNodeStatus) -> WorkNode {
        WorkNode {
            id: "task-1".into(),
            parent_id: Some("story-1".into()),
            project_id: "proj-core".into(),
            kind: WorkNodeKind::Task,
            title: "Test task".into(),
            description: String::new(),
            status,
            priority: 3,
            story_points: 2,
            backlog_rank: 0,
            assignee_agent_id: Some("agent-1".into()),
            assigned_by_manager_id: None,
            owner_pm_agent_id: None,
            retry_count: 0,
            department: "Engineering".into(),
            sprint_id: None,
            depends_on: Vec::new(),
            acceptance_criteria: vec![],
            linked_workspace_page_id: None,
            linked_gig_contract_id: None,
            awaiting_ceo_gate: false,
            created_at: String::new(),
            updated_at: String::new(),
            completed_at: None,
        }
    }

    #[test]
    fn retry_blocked_requeues_under_max() {
        let mut state = AppState::default();
        state.settings.scrum_max_blocked_retries = 2;
        let mut task = sample_task(WorkNodeStatus::Blocked);
        task.retry_count = 1;
        state.work_nodes.push(task);

        let retried = retry_blocked_tasks(&mut state);
        assert_eq!(retried, 1);
        assert_eq!(state.work_nodes[0].status, WorkNodeStatus::Ready);
        assert_eq!(state.work_nodes[0].retry_count, 2);
    }

    #[test]
    fn approve_deliverable_marks_done() {
        let mut state = AppState::default();
        let mut task = sample_task(WorkNodeStatus::InReview);
        task.id = "task-review".into();
        state.work_nodes.push(task);

        approve_deliverable_core(&mut state, "task-review").expect("approve");
        assert_eq!(state.work_nodes[0].status, WorkNodeStatus::Done);
        assert!(state.work_nodes[0].completed_at.is_some());
    }

    #[test]
    fn directive_lifecycle_moves_to_executing_then_done() {
        let mut state = AppState::default();
        state.directives.push(Directive {
            id: "dir-1".into(),
            title: "Ship".into(),
            description: String::new(),
            source: DirectiveSource::Ceo,
            target: DirectiveTarget::Project,
            target_ref: "proj-core".into(),
            status: DirectiveStatus::Routed,
            spawned_node_ids: vec!["story-1".into()],
            awaiting_ceo_gate: false,
            ceo_comment: String::new(),
            created_at: String::new(),
        });
        state.work_nodes.push(WorkNode {
            id: "story-1".into(),
            parent_id: None,
            project_id: "proj-core".into(),
            kind: WorkNodeKind::Story,
            title: "Story".into(),
            description: String::new(),
            status: WorkNodeStatus::InSprint,
            priority: 3,
            story_points: 3,
            backlog_rank: 0,
            assignee_agent_id: None,
            assigned_by_manager_id: None,
            owner_pm_agent_id: None,
            retry_count: 0,
            department: "Engineering".into(),
            sprint_id: None,
            depends_on: Vec::new(),
            acceptance_criteria: vec![],
            linked_workspace_page_id: None,
            linked_gig_contract_id: None,
            awaiting_ceo_gate: false,
            created_at: String::new(),
            updated_at: String::new(),
            completed_at: None,
        });
        let mut task = sample_task(WorkNodeStatus::InSprint);
        task.parent_id = Some("story-1".into());
        state.work_nodes.push(task.clone());

        update_directive_lifecycle(&mut state);
        assert_eq!(state.directives[0].status, DirectiveStatus::Executing);

        if let Some(node) = state.work_nodes.iter_mut().find(|n| n.id == "task-1") {
            node.status = WorkNodeStatus::Done;
        }
        update_directive_lifecycle(&mut state);
        assert_eq!(state.directives[0].status, DirectiveStatus::Done);
    }

    #[test]
    fn seed_org_links_assigns_reports_to_coo() {
        let mut state = AppState::default();
        state.settings.play_mode = crate::state::PlayMode::Work;
        state
            .apply_agent_roster(&crate::state::default_agent_roster())
            .expect("roster");
        seed_default_org_links(&mut state);
        let mira = state.agents.get("agent-1").expect("mira");
        assert!(mira.reports_to.is_some());
    }
}