use super::types::{Directive, DirectiveTarget, WorkNode};
use crate::state::{AgentRecord, AppState};

/// Resolve which project a directive should route into based on its target metadata.
pub fn resolve_project_for_directive(state: &AppState, directive: &Directive) -> Option<String> {
    match directive.target {
        DirectiveTarget::Project => state
            .projects
            .iter()
            .find(|p| p.id == directive.target_ref || p.title == directive.target_ref)
            .map(|p| p.id.clone())
            .or_else(|| state.projects.first().map(|p| p.id.clone())),
        DirectiveTarget::Department => state
            .projects
            .iter()
            .find(|p| p.owner_department == directive.target_ref)
            .map(|p| p.id.clone())
            .or_else(|| {
                state
                    .projects
                    .iter()
                    .min_by_key(|p| p.priority)
                    .map(|p| p.id.clone())
            }),
        DirectiveTarget::Agent => {
            let agent = state.agents.get(&directive.target_ref)?;
            state
                .projects
                .iter()
                .find(|p| p.owner_department == agent.department)
                .map(|p| p.id.clone())
                .or_else(|| state.projects.first().map(|p| p.id.clone()))
        }
    }
}

/// PM for a project: project.pm_agent_id → default_pm → co_ceo → role match.
pub fn resolve_pm_agent_id(state: &AppState, project_id: Option<&str>) -> Option<String> {
    if let Some(pid) = project_id {
        if let Some(project) = state.projects.iter().find(|p| p.id == pid) {
            if let Some(pm_id) = &project.pm_agent_id {
                if state.agents.contains_key(pm_id) {
                    return Some(pm_id.clone());
                }
            }
        }
    }

    if let Some(id) = &state.default_pm_agent_id {
        if state.agents.contains_key(id) {
            return Some(id.clone());
        }
    }
    if let Some(id) = &state.co_ceo.agent_id {
        if state.agents.contains_key(id) {
            return Some(id.clone());
        }
    }
    state
        .agents
        .values()
        .find(|a| {
            let role = a.role.to_lowercase();
            (role.contains("pm") || role.contains("project manager") || role.contains("coo"))
                && !crate::fate::is_system_agent(a)
        })
        .map(|a| a.id.clone())
}

pub fn department_head_for(state: &AppState, department: &str) -> Option<String> {
    state
        .agents
        .values()
        .filter(|a| !crate::fate::is_system_agent(a))
        .find(|a| {
            a.manages_department
                .as_deref()
                .is_some_and(|dept| dept == department)
        })
        .map(|a| a.id.clone())
        .or_else(|| {
            state.agents.values().find(|a| {
                !crate::fate::is_system_agent(a)
                    && a.department == department
                    && (a.role.to_lowercase().contains("lead")
                        || a.role.to_lowercase().contains("head")
                        || a.role.to_lowercase().contains("coo")
                        || a.role.to_lowercase().contains("manager"))
            }).map(|a| a.id.clone())
        })
}

pub fn subordinates_of(state: &AppState, manager_id: &str) -> Vec<String> {
    state
        .agents
        .values()
        .filter(|a| {
            !crate::fate::is_system_agent(a)
                && a.reports_to.as_deref() == Some(manager_id)
        })
        .map(|a| a.id.clone())
        .collect()
}

pub fn agent_eligible_for_task(task: &WorkNode, agent: &AgentRecord, state: &AppState) -> bool {
    if crate::fate::is_system_agent(agent) {
        return false;
    }
    if let Some(manager_id) = &task.assigned_by_manager_id {
        let subs = subordinates_of(state, manager_id);
        if !subs.is_empty() && !subs.iter().any(|id| id == &agent.id) {
            return false;
        }
    }
    true
}

pub fn seed_default_org_links(state: &mut AppState) {
    let coo_id = state
        .agents
        .values()
        .find(|a| {
            let role = a.role.to_lowercase();
            role.contains("coo") || role.contains("ceo") || a.department == "Executive"
        })
        .map(|a| a.id.clone());

    let Some(coo_id) = coo_id else {
        return;
    };

    if let Some(coo) = state.agents.get_mut(&coo_id) {
        coo.manages_department = Some("Executive".to_string());
    }

    for agent in state.agents.values_mut() {
        if agent.id == coo_id || crate::fate::is_system_agent(agent) {
            continue;
        }
        if agent.reports_to.is_none() {
            agent.reports_to = Some(coo_id.clone());
        }
        let role = agent.role.to_lowercase();
        if agent.manages_department.is_none()
            && (role.contains("lead") || role.contains("head") || role.contains("manager"))
        {
            agent.manages_department = Some(agent.department.clone());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scrum::types::{DirectiveSource, DirectiveStatus};
    use crate::state::AppState;

    #[test]
    fn resolves_department_directive_to_matching_project() {
        let mut state = AppState::default();
        state.projects.push(crate::state::InternalProject {
            id: "proj-hr".into(),
            title: "HR Program".into(),
            progress: 0.0,
            priority: 1,
            owner_department: "Human Resources".into(),
            description: String::new(),
            pm_agent_id: None,
            active_sprint_id: None,
            default_cycle_days: 14,
        });
        let directive = Directive {
            id: "dir-1".into(),
            title: "HR push".into(),
            description: String::new(),
            source: DirectiveSource::Ceo,
            target: DirectiveTarget::Department,
            target_ref: "Human Resources".into(),
            status: DirectiveStatus::Open,
            spawned_node_ids: vec![],
            awaiting_ceo_gate: false,
            ceo_comment: String::new(),
            created_at: String::new(),
        };
        let project_id = resolve_project_for_directive(&state, &directive).expect("project");
        let project = state.projects.iter().find(|p| p.id == project_id).unwrap();
        assert_eq!(project.owner_department, "Human Resources");
    }
}