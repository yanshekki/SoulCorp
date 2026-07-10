//! Per-agent serial task queue (Kafka-like partitions keyed by agent_id).
//!
//! Ordering: oldest `queued_at` first, then higher priority, then id.
//! At most one InProgress execution per agent.

use super::executor::dependencies_satisfied;
use super::tree::now_iso;
use super::types::{WorkNode, WorkNodeKind, WorkNodeStatus};
use crate::state::AppState;
use std::cmp::Ordering;

/// Stamp `queued_at` when a task is assigned (enqueue onto that agent partition).
pub fn enqueue_task(node: &mut WorkNode) {
    if node.assignee_agent_id.is_some() && node.queued_at.is_none() {
        node.queued_at = Some(now_iso());
    }
}

/// Assign agent and enqueue in one step.
/// Reassignment (different agent) always gets a fresh queue timestamp.
pub fn assign_and_enqueue(node: &mut WorkNode, agent_id: String) {
    let reassigned = node.assignee_agent_id.as_deref() != Some(agent_id.as_str());
    node.assignee_agent_id = Some(agent_id);
    if reassigned || node.queued_at.is_none() {
        node.queued_at = Some(now_iso());
    }
    node.updated_at = now_iso();
}

/// Stamp `queued_at` for legacy assigned tasks that predate the queue field.
pub fn backfill_missing_queued_at(state: &mut AppState) -> u32 {
    let mut count = 0u32;
    for node in state.work_nodes.iter_mut() {
        if node.kind != WorkNodeKind::Task {
            continue;
        }
        if node.assignee_agent_id.is_none() || node.queued_at.is_some() {
            continue;
        }
        if matches!(
            node.status,
            WorkNodeStatus::Ready
                | WorkNodeStatus::InSprint
                | WorkNodeStatus::InProgress
                | WorkNodeStatus::Blocked
        ) {
            let stamp = if node.created_at.trim().is_empty() {
                now_iso()
            } else {
                node.created_at.clone()
            };
            node.queued_at = Some(stamp);
            count = count.saturating_add(1);
        }
    }
    count
}

pub fn agent_is_busy(state: &AppState, agent_id: &str) -> bool {
    if state.work_nodes.iter().any(|n| {
        n.assignee_agent_id.as_deref() == Some(agent_id)
            && n.status == WorkNodeStatus::InProgress
            && n.kind == WorkNodeKind::Task
    }) {
        return true;
    }
    state
        .agents
        .get(agent_id)
        .map(|a| a.status.eq_ignore_ascii_case("working"))
        .unwrap_or(false)
}

fn queue_sort_key(a: &WorkNode, b: &WorkNode) -> Ordering {
    let a_q = a.queued_at.as_deref().unwrap_or(a.created_at.as_str());
    let b_q = b.queued_at.as_deref().unwrap_or(b.created_at.as_str());
    a_q.cmp(b_q)
        .then_with(|| b.priority.cmp(&a.priority))
        .then_with(|| a.id.cmp(&b.id))
}

/// Ready/InSprint tasks for an agent that pass dependencies, ordered for dequeue.
pub fn queued_tasks_for_agent<'a>(state: &'a AppState, agent_id: &str) -> Vec<&'a WorkNode> {
    let mut tasks: Vec<&WorkNode> = state
        .work_nodes
        .iter()
        .filter(|n| {
            n.kind == WorkNodeKind::Task
                && n.assignee_agent_id.as_deref() == Some(agent_id)
                && matches!(n.status, WorkNodeStatus::InSprint | WorkNodeStatus::Ready)
                && dependencies_satisfied(state, n)
        })
        .collect();
    tasks.sort_by(|a, b| queue_sort_key(a, b));
    tasks
}

/// Head of the agent partition (next task to run), if any.
pub fn next_queued_task(state: &AppState, agent_id: &str) -> Option<WorkNode> {
    if agent_is_busy(state, agent_id) {
        return None;
    }
    queued_tasks_for_agent(state, agent_id)
        .into_iter()
        .next()
        .cloned()
}

/// Count of waiting (Ready/InSprint) tasks for display.
pub fn queue_depth(state: &AppState, agent_id: &str) -> u32 {
    state
        .work_nodes
        .iter()
        .filter(|n| {
            n.kind == WorkNodeKind::Task
                && n.assignee_agent_id.as_deref() == Some(agent_id)
                && matches!(n.status, WorkNodeStatus::InSprint | WorkNodeStatus::Ready)
        })
        .count() as u32
}

/// Fair serial pick: free agent whose queue head has the oldest queued_at.
pub fn pick_serial_candidate(state: &AppState) -> Option<String> {
    // (work_node_id, queued_at, priority)
    let mut best: Option<(String, String, u8)> = None;

    for agent in state.agents.values() {
        if crate::fate::is_system_agent(agent) {
            continue;
        }
        let Some(task) = next_queued_task(state, &agent.id) else {
            continue;
        };
        let q = task
            .queued_at
            .clone()
            .unwrap_or_else(|| task.created_at.clone());
        let key = (task.id.clone(), q, task.priority);
        match &best {
            None => best = Some(key),
            Some((_, bq, bp)) => {
                // Prefer older queue time; if equal, higher priority.
                let older = key.1 < *bq;
                let same_time_higher_prio = key.1 == *bq && key.2 > *bp;
                if older || same_time_higher_prio {
                    best = Some(key);
                }
            }
        }
    }

    best.map(|(id, _, _)| id)
}

/// Work node ids for up to `max_agents` free agents (one head each).
pub fn pick_parallel_candidates(state: &AppState, max_agents: usize) -> Vec<(String, String)> {
    // (agent_id, work_node_id)
    let mut out = Vec::new();
    let mut agent_ids: Vec<String> = state
        .agents
        .values()
        .filter(|a| !crate::fate::is_system_agent(a))
        .map(|a| a.id.clone())
        .collect();
    agent_ids.sort();

    for agent_id in agent_ids {
        if out.len() >= max_agents {
            break;
        }
        if let Some(task) = next_queued_task(state, &agent_id) {
            out.push((agent_id, task.id));
        }
    }
    out
}

/// Strict gate for manual execution: agent free and task is queue head.
pub fn assert_can_execute_now(state: &AppState, work_node_id: &str) -> Result<(), String> {
    let task = state
        .work_nodes
        .iter()
        .find(|n| n.id == work_node_id)
        .ok_or_else(|| "Work item not found.".to_string())?;
    if task.kind != WorkNodeKind::Task {
        return Err("Only tasks can be executed.".to_string());
    }
    let agent_id = task
        .assignee_agent_id
        .as_deref()
        .ok_or_else(|| "Assign an agent before executing.".to_string())?;

    if agent_is_busy(state, agent_id) {
        return Err(format!(
            "Agent is busy with another task; this work stays queued (depth {}).",
            queue_depth(state, agent_id)
        ));
    }

    let head = next_queued_task(state, agent_id)
        .ok_or_else(|| "No runnable task at the head of this agent's queue.".to_string())?;
    if head.id != work_node_id {
        return Err(format!(
            "Task is not at the head of the agent's queue. Next up: «{}».",
            head.title
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{AgentRecord, AppState};

    fn agent(id: &str) -> AgentRecord {
        AgentRecord {
            id: id.into(),
            name: id.into(),
            role: "Engineer".into(),
            department: "Engineering".into(),
            morale: 0.8,
            energy: 0.8,
            salary: 1.0,
            status: "idle".into(),
            soul: None,
            soul_id: None,
            ai_provider: None,
            agent_runtime_mode: None,
            agent_kind: None,
            skills: vec![],
            reports_to: None,
            manages_department: None,
        }
    }

    fn task(id: &str, agent: &str, priority: u8, queued: &str) -> WorkNode {
        WorkNode {
            id: id.into(),
            parent_id: None,
            project_id: "p".into(),
            kind: WorkNodeKind::Task,
            title: id.into(),
            description: String::new(),
            status: WorkNodeStatus::Ready,
            priority,
            story_points: 1,
            backlog_rank: 0,
            assignee_agent_id: Some(agent.into()),
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
            created_at: queued.into(),
            updated_at: queued.into(),
            completed_at: None,
            queued_at: Some(queued.into()),
        }
    }

    #[test]
    fn same_agent_queue_is_fifo_by_queued_at() {
        let mut state = AppState::default();
        state.agents.insert("a1".into(), agent("a1"));
        state.work_nodes.push(task("t2", "a1", 5, "2026-01-02T00:00:00Z"));
        state.work_nodes.push(task("t1", "a1", 1, "2026-01-01T00:00:00Z"));
        let next = next_queued_task(&state, "a1").expect("head");
        assert_eq!(next.id, "t1");
    }

    #[test]
    fn busy_agent_returns_no_next() {
        let mut state = AppState::default();
        state.agents.insert("a1".into(), agent("a1"));
        let mut in_progress = task("busy", "a1", 3, "2026-01-01T00:00:00Z");
        in_progress.status = WorkNodeStatus::InProgress;
        state.work_nodes.push(in_progress);
        state.work_nodes.push(task("waiting", "a1", 5, "2026-01-02T00:00:00Z"));
        assert!(next_queued_task(&state, "a1").is_none());
        assert!(agent_is_busy(&state, "a1"));
    }

    #[test]
    fn parallel_picks_one_per_agent() {
        let mut state = AppState::default();
        state.agents.insert("a1".into(), agent("a1"));
        state.agents.insert("a2".into(), agent("a2"));
        state.work_nodes.push(task("t1", "a1", 1, "2026-01-01T00:00:00Z"));
        state.work_nodes.push(task("t2", "a1", 5, "2026-01-02T00:00:00Z"));
        state.work_nodes.push(task("t3", "a2", 3, "2026-01-01T00:00:00Z"));
        let picks = pick_parallel_candidates(&state, 4);
        assert_eq!(picks.len(), 2);
        assert!(picks.iter().any(|(a, w)| a == "a1" && w == "t1"));
        assert!(picks.iter().any(|(a, w)| a == "a2" && w == "t3"));
    }

    #[test]
    fn reassignment_refreshes_queued_at() {
        let mut node = task("t1", "a1", 3, "2026-01-01T00:00:00Z");
        assign_and_enqueue(&mut node, "a2".into());
        assert_eq!(node.assignee_agent_id.as_deref(), Some("a2"));
        assert_ne!(node.queued_at.as_deref(), Some("2026-01-01T00:00:00Z"));
    }

    #[test]
    fn backfill_stamps_legacy_assigned_tasks() {
        let mut state = AppState::default();
        let mut legacy = task("legacy", "a1", 2, "2026-01-01T00:00:00Z");
        legacy.queued_at = None;
        legacy.created_at = "2025-12-01T00:00:00Z".into();
        state.work_nodes.push(legacy);
        let n = backfill_missing_queued_at(&mut state);
        assert_eq!(n, 1);
        assert_eq!(
            state.work_nodes[0].queued_at.as_deref(),
            Some("2025-12-01T00:00:00Z")
        );
    }
}
