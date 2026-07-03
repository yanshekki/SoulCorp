pub mod events;

use crate::state::{AgentRecord, AppState, PlayMode};

pub const FATE_AGENT_ID: &str = "agent-fate";
pub const MIN_EVENT_CHANCE: f32 = 0.05;
pub const MAX_EVENT_CHANCE: f32 = 0.30;
pub const DEFAULT_EVENT_CHANCE: f32 = 0.15;

pub fn is_system_agent(agent: &AgentRecord) -> bool {
    agent.agent_kind.as_deref() == Some("fate")
}

pub fn is_fate_agent_id(agent_id: &str) -> bool {
    agent_id == FATE_AGENT_ID
}

pub fn eligible_for_random_events(state: &AppState) -> bool {
    state.settings.play_mode == PlayMode::Game && state.settings.random_events_enabled
}

pub fn event_roll_threshold(state: &AppState) -> f32 {
    if !eligible_for_random_events(state) {
        return 0.0;
    }
    state
        .settings
        .random_event_chance
        .clamp(MIN_EVENT_CHANCE, MAX_EVENT_CHANCE)
}

pub fn clamp_event_chance(chance: f32) -> f32 {
    chance.clamp(MIN_EVENT_CHANCE, MAX_EVENT_CHANCE)
}

pub fn ensure_fate_agent(state: &mut AppState) {
    if let Some(agent) = state.agents.get_mut(FATE_AGENT_ID) {
        agent.status = if state.settings.random_events_enabled {
            "watching".to_string()
        } else {
            "idle".to_string()
        };
        agent.agent_kind = Some("fate".to_string());
        return;
    }

    state.agents.insert(
        FATE_AGENT_ID.to_string(),
        AgentRecord {
            id: FATE_AGENT_ID.to_string(),
            name: "Fate".to_string(),
            role: "Director of Chance".to_string(),
            department: "Meta".to_string(),
            morale: 1.0,
            energy: 1.0,
            salary: 0.0,
            status: if state.settings.random_events_enabled {
                "watching".to_string()
            } else {
                "idle".to_string()
            },
            soul: None,
            soul_id: None,
            ai_provider: None,
            agent_kind: Some("fate".to_string()),
            skills: crate::state::skills_for_role("Director of Chance"),
            reports_to: None,
            manages_department: None,
        },
    );
}

pub fn set_fate_dormant(state: &mut AppState) {
    if let Some(agent) = state.agents.get_mut(FATE_AGENT_ID) {
        agent.status = "dormant".to_string();
    }
}

pub fn sync_play_mode_side_effects(state: &mut AppState) {
    state.settings.random_event_chance = clamp_event_chance(state.settings.random_event_chance);
    match state.settings.play_mode {
        PlayMode::Work => {
            state.settings.random_events_enabled = false;
            set_fate_dormant(state);
        }
        PlayMode::Game => ensure_fate_agent(state),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{AppState, PlayMode};

    #[test]
    fn fate_agent_is_system_agent() {
        let mut state = AppState::default();
        state.settings.play_mode = PlayMode::Game;
        ensure_fate_agent(&mut state);
        let fate = state.agents.get(FATE_AGENT_ID).expect("fate");
        assert!(is_system_agent(fate));
        assert_eq!(fate.salary, 0.0);
    }

    #[test]
    fn work_mode_disables_random_events() {
        let mut state = AppState::default();
        state.settings.play_mode = PlayMode::Work;
        state.settings.random_events_enabled = true;
        sync_play_mode_side_effects(&mut state);
        assert!(!state.settings.random_events_enabled);
        assert!(!eligible_for_random_events(&state));
    }
}