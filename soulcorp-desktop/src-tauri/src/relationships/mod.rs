use crate::state::{AgentRecord, AgentRelationship, AppState};
use chrono::Utc;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationshipGraphNode {
    pub agent_id: String,
    pub name: String,
    pub department: String,
    pub morale: f32,
    pub connection_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationshipGraphEdge {
    pub from_agent_id: String,
    pub to_agent_id: String,
    pub relationship_type: String,
    pub score: f32,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationshipGraph {
    pub nodes: Vec<RelationshipGraphNode>,
    pub edges: Vec<RelationshipGraphEdge>,
}

pub fn canonical_pair(left: &str, right: &str) -> (String, String) {
    if left <= right {
        (left.to_string(), right.to_string())
    } else {
        (right.to_string(), left.to_string())
    }
}

pub fn relationship_label(relationship_type: &str, score: f32) -> String {
    match relationship_type {
        "friend" => "Friends".to_string(),
        "rival" | "rivalry" => "Rivals".to_string(),
        "mentor" => "Mentor".to_string(),
        "crush" | "romance" => "Close bond".to_string(),
        "tense" => "Tense".to_string(),
        "enemy" => "Hostile".to_string(),
        _ if score >= 0.65 => "Allies".to_string(),
        _ if score >= 0.35 => "Cordial".to_string(),
        _ if score >= 0.0 => "Neutral".to_string(),
        _ => "Strained".to_string(),
    }
}

pub fn infer_relationship_type(score: f32) -> &'static str {
    if score >= 0.75 {
        "friend"
    } else if score >= 0.45 {
        "neutral"
    } else if score >= 0.2 {
        "tense"
    } else {
        "rival"
    }
}

pub fn ensure_relationship_backfill(state: &mut AppState) {
    if state.agents.len() >= 2 && state.agent_relationships.is_empty() {
        seed_default_relationships(state);
    }
}

pub fn seed_default_relationships(state: &mut AppState) {
    if !state.agent_relationships.is_empty() {
        return;
    }

    let pairs = [
        ("agent-1", "agent-2", "friend", 0.72),
        ("agent-1", "agent-3", "mentor", 0.58),
        ("agent-2", "agent-3", "tense", 0.34),
    ];

    for (left, right, relationship_type, score) in pairs {
        upsert_relationship(state, left, right, relationship_type, score);
    }
}

pub fn upsert_relationship(
    state: &mut AppState,
    left_id: &str,
    right_id: &str,
    relationship_type: &str,
    score: f32,
) {
    if left_id == right_id {
        return;
    }

    let (from_id, to_id) = canonical_pair(left_id, right_id);
    let clamped = score.clamp(-1.0, 1.0);
    if let Some(existing) = state
        .agent_relationships
        .iter_mut()
        .find(|edge| edge.from_agent_id == from_id && edge.to_agent_id == to_id)
    {
        existing.relationship_type = relationship_type.to_string();
        existing.score = clamped;
        existing.updated_at = Utc::now().to_rfc3339();
        return;
    }

    state.agent_relationships.push(AgentRelationship {
        id: Uuid::new_v4().to_string(),
        from_agent_id: from_id,
        to_agent_id: to_id,
        relationship_type: relationship_type.to_string(),
        score: clamped,
        updated_at: Utc::now().to_rfc3339(),
    });
}

pub fn connect_new_agent(state: &mut AppState, new_agent_id: &str, department: &str) {
    let peers: Vec<(String, String)> = state
        .agents
        .iter()
        .filter(|(agent_id, _)| *agent_id != new_agent_id)
        .map(|(agent_id, agent)| (agent_id.clone(), agent.department.clone()))
        .collect();

    for (agent_id, peer_department) in peers {
        let mut score = 0.42;
        if peer_department == department {
            score += 0.18;
        }
        if peer_department.to_lowercase().contains("human") {
            score += 0.08;
        }

        let relationship_type = infer_relationship_type(score);
        upsert_relationship(state, new_agent_id, &agent_id, relationship_type, score);
    }
}

pub fn build_relationship_graph(state: &AppState) -> RelationshipGraph {
    let mut connection_counts: HashMap<String, u32> = HashMap::new();
    for edge in &state.agent_relationships {
        *connection_counts.entry(edge.from_agent_id.clone()).or_insert(0) += 1;
        *connection_counts.entry(edge.to_agent_id.clone()).or_insert(0) += 1;
    }

    let nodes = state
        .agents
        .values()
        .map(|agent| RelationshipGraphNode {
            agent_id: agent.id.clone(),
            name: agent.name.clone(),
            department: agent.department.clone(),
            morale: agent.morale,
            connection_count: *connection_counts.get(&agent.id).unwrap_or(&0),
        })
        .collect::<Vec<_>>();

    let edges = state
        .agent_relationships
        .iter()
        .map(|edge| RelationshipGraphEdge {
            from_agent_id: edge.from_agent_id.clone(),
            to_agent_id: edge.to_agent_id.clone(),
            relationship_type: edge.relationship_type.clone(),
            score: edge.score,
            label: relationship_label(&edge.relationship_type, edge.score),
        })
        .collect();

    RelationshipGraph { nodes, edges }
}

pub fn apply_relationship_tick(state: &mut AppState) {
    if state.agents.len() < 2 {
        return;
    }

    let mut rng = rand::rng();
    let agent_ids: Vec<String> = state.agents.keys().cloned().collect();
    let left = agent_ids[rng.random_range(0..agent_ids.len())].clone();
    let mut right = agent_ids[rng.random_range(0..agent_ids.len())].clone();
    if left == right {
        right = agent_ids[(rng.random_range(0..agent_ids.len()) + 1) % agent_ids.len()].clone();
    }

    let (left_agent, right_agent) = (
        state.agents.get(&left).cloned(),
        state.agents.get(&right).cloned(),
    );
    let (Some(left_agent), Some(right_agent)) = (left_agent, right_agent) else {
        return;
    };

    let drift = relationship_drift(&left_agent, &right_agent, &mut rng);
    let (from_id, to_id) = canonical_pair(&left, &right);
    let current = state
        .agent_relationships
        .iter()
        .find(|edge| edge.from_agent_id == from_id && edge.to_agent_id == to_id)
        .map(|edge| edge.score)
        .unwrap_or(0.4);

    let next_score = (current + drift).clamp(-1.0, 1.0);
    let relationship_type = infer_relationship_type(next_score);
    upsert_relationship(state, &left, &right, relationship_type, next_score);
}

fn relationship_drift(left: &AgentRecord, right: &AgentRecord, rng: &mut impl Rng) -> f32 {
    let mut drift = rng.random_range(-0.04..0.04);
    if left.department == right.department {
        drift += 0.02;
    }
    if left.morale < 0.45 || right.morale < 0.45 {
        drift -= 0.03;
    }
    if left.morale > 0.75 && right.morale > 0.75 {
        drift += 0.02;
    }
    drift
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppState;

    #[test]
    fn seeds_default_relationship_edges() {
        let mut state = AppState::default();
        state.seed_defaults();
        seed_default_relationships(&mut state);
        assert_eq!(state.agent_relationships.len(), 3);
    }

    #[test]
    fn graph_includes_nodes_for_all_agents() {
        let mut state = AppState::default();
        state.seed_defaults();
        seed_default_relationships(&mut state);
        let graph = build_relationship_graph(&state);
        assert_eq!(graph.nodes.len(), 3);
        assert_eq!(graph.edges.len(), 3);
    }
}