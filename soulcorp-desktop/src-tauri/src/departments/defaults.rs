use crate::state::AppState;

const MAX_DEPARTMENTS: usize = 20;

pub fn max_departments() -> usize {
    MAX_DEPARTMENTS
}

pub fn ensure_default_departments(_state: &mut AppState) {
    // Departments are created by the user via onboarding or the Departments page.
}

pub fn department_names(state: &AppState) -> Vec<String> {
    let mut names: Vec<String> = state.departments.iter().map(|dept| dept.name.clone()).collect();
    for agent in state.agents.values() {
        if !names.iter().any(|name| name == &agent.department) {
            names.push(agent.department.clone());
        }
    }
    names.sort();
    names.dedup();
    names
}

pub fn department_exists(state: &AppState, name: &str) -> bool {
    department_names(state).iter().any(|dept| dept == name)
}