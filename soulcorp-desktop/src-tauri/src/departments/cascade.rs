use crate::state::AppState;
use crate::token_budget::ensure_department_wallet;
use std::collections::HashMap;

pub fn rename_department_references(state: &mut AppState, old_name: &str, new_name: &str) {
    if old_name == new_name {
        return;
    }

    for agent in state.agents.values_mut() {
        if agent.department == old_name {
            agent.department = new_name.to_string();
        }
        if agent.manages_department.as_deref() == Some(old_name) {
            agent.manages_department = Some(new_name.to_string());
        }
    }

    for project in &mut state.projects {
        if project.owner_department == old_name {
            project.owner_department = new_name.to_string();
        }
    }

    for directive in &mut state.directives {
        if directive.target_ref == old_name {
            directive.target_ref = new_name.to_string();
        }
    }

    if let Some(provider) = state.department_ai_providers.remove(old_name) {
        state
            .department_ai_providers
            .insert(new_name.to_string(), provider);
    }

    if let Some(wallet) = state.token_economy.departments.remove(old_name) {
        state
            .token_economy
            .departments
            .insert(new_name.to_string(), wallet);
    } else {
        ensure_department_wallet(&mut state.token_economy, new_name);
    }

    for department in &mut state.departments {
        if department.name == old_name {
            department.name = new_name.to_string();
        }
    }
}

pub fn transfer_department_members(state: &mut AppState, from: &str, to: &str) {
    for agent in state.agents.values_mut() {
        if agent.department == from {
            agent.department = to.to_string();
        }
        if agent.manages_department.as_deref() == Some(from) {
            agent.manages_department = Some(to.to_string());
        }
    }

    for project in &mut state.projects {
        if project.owner_department == from {
            project.owner_department = to.to_string();
        }
    }

    for directive in &mut state.directives {
        if directive.target_ref == from {
            directive.target_ref = to.to_string();
        }
    }

    if let Some(provider) = state.department_ai_providers.remove(from) {
        state
            .department_ai_providers
            .entry(to.to_string())
            .or_insert(provider);
    }

    let from_wallet = state.token_economy.departments.remove(from);
    if let Some(mut wallet) = from_wallet {
        let target = state
            .token_economy
            .departments
            .entry(to.to_string())
            .or_insert_with(Default::default);
        target.balance = target.balance.saturating_add(wallet.balance);
        target.allocated = target.allocated.saturating_add(wallet.allocated);
        target.spent = target.spent.saturating_add(wallet.spent);
        if target.period_limit == 0 && wallet.period_limit > 0 {
            target.period_limit = wallet.period_limit;
            target.period_type = wallet.period_type;
            target.period_days = wallet.period_days;
            target.period_spent = wallet.period_spent;
            target.period_started_at = wallet.period_started_at;
        }
    }
}

pub fn clear_department_head_references(state: &mut AppState, department_id: &str) {
    for department in &mut state.departments {
        if department.id == department_id {
            department.head_agent_id = None;
        }
        if department.parent_department_id.as_deref() == Some(department_id) {
            department.parent_department_id = None;
        }
    }
}

pub fn member_count_by_department(state: &AppState) -> HashMap<String, u32> {
    let mut counts = HashMap::new();
    for agent in state.agents.values() {
        if crate::fate::is_system_agent(agent) {
            continue;
        }
        *counts.entry(agent.department.clone()).or_insert(0) += 1;
    }
    counts
}