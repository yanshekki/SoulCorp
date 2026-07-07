use crate::fate::is_system_agent;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrgChartNode {
    pub agent_id: String,
    pub name: String,
    pub role: String,
    pub department: String,
    pub reports_to: Option<String>,
    pub manages_department: Option<String>,
    pub children: Vec<OrgChartNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrgChartSnapshot {
    pub roots: Vec<OrgChartNode>,
    pub unassigned: Vec<OrgChartNode>,
}

pub fn build_org_chart(state: &AppState) -> OrgChartSnapshot {
    let agents: Vec<_> = state
        .agents
        .values()
        .filter(|agent| !is_system_agent(agent))
        .collect();

    let mut children_by_manager: HashMap<String, Vec<String>> = HashMap::new();
    let mut roots = Vec::new();

    for agent in &agents {
        match agent.reports_to.as_deref() {
            Some(manager_id) if state.agents.contains_key(manager_id) => {
                children_by_manager
                    .entry(manager_id.to_string())
                    .or_default()
                    .push(agent.id.clone());
            }
            _ => roots.push(agent.id.clone()),
        }
    }

    if roots.is_empty() {
        for agent in &agents {
            if agent.manages_department.is_some()
                || agent.role.to_lowercase().contains("ceo")
                || agent.role.to_lowercase().contains("coo")
            {
                roots.push(agent.id.clone());
            }
        }
        roots.sort();
        roots.dedup();
    }

    let mut visiting = HashSet::new();
    let built_roots: Vec<OrgChartNode> = roots
        .iter()
        .filter_map(|agent_id| build_node(state, agent_id, &children_by_manager, &mut visiting))
        .collect();

    let assigned: HashSet<String> = collect_node_ids(&built_roots);
    let unassigned = agents
        .iter()
        .filter(|agent| !assigned.contains(&agent.id))
        .map(|agent| OrgChartNode {
            agent_id: agent.id.clone(),
            name: agent.name.clone(),
            role: agent.role.clone(),
            department: agent.department.clone(),
            reports_to: agent.reports_to.clone(),
            manages_department: agent.manages_department.clone(),
            children: Vec::new(),
        })
        .collect();

    OrgChartSnapshot {
        roots: built_roots,
        unassigned,
    }
}

fn build_node(
    state: &AppState,
    agent_id: &str,
    children_by_manager: &HashMap<String, Vec<String>>,
    visiting: &mut HashSet<String>,
) -> Option<OrgChartNode> {
    if !visiting.insert(agent_id.to_string()) {
        return None;
    }
    let agent = state.agents.get(agent_id)?;
    let children = children_by_manager
        .get(agent_id)
        .into_iter()
        .flatten()
        .filter_map(|child_id| build_node(state, child_id, children_by_manager, visiting))
        .collect();
    visiting.remove(agent_id);

    Some(OrgChartNode {
        agent_id: agent.id.clone(),
        name: agent.name.clone(),
        role: agent.role.clone(),
        department: agent.department.clone(),
        reports_to: agent.reports_to.clone(),
        manages_department: agent.manages_department.clone(),
        children,
    })
}

fn collect_node_ids(nodes: &[OrgChartNode]) -> HashSet<String> {
    let mut ids = HashSet::new();
    for node in nodes {
        ids.insert(node.agent_id.clone());
        ids.extend(collect_node_ids(&node.children));
    }
    ids
}

pub fn would_create_reporting_cycle(
    state: &AppState,
    agent_id: &str,
    new_manager_id: Option<&str>,
) -> bool {
    let Some(manager_id) = new_manager_id else {
        return false;
    };
    if agent_id == manager_id {
        return true;
    }

    let mut current = Some(manager_id.to_string());
    let mut visited = HashSet::new();
    while let Some(id) = current {
        if id == agent_id || !visited.insert(id.clone()) {
            return true;
        }
        current = state
            .agents
            .get(&id)
            .and_then(|agent| agent.reports_to.clone());
    }
    false
}