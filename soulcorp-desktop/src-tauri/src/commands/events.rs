use crate::state::{AppState, EventMode, GameEvent};
use crate::tier::benefits_for_tier;
use rand::{Rng, SeedableRng};
use rand::rngs::StdRng;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForesightEvent {
    pub id: String,
    pub title: String,
    pub description: String,
    pub tone: String,
    pub expected_day: u32,
    pub confidence: f32,
    pub morale_delta: f32,
    pub cash_delta: f64,
}

#[tauri::command]
pub fn get_recent_events(state: State<'_, Mutex<AppState>>) -> Result<Vec<GameEvent>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.events.iter().rev().take(8).cloned().collect())
}

#[tauri::command]
pub fn get_event_foresight(state: State<'_, Mutex<AppState>>) -> Result<Vec<ForesightEvent>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    if !state.settings.random_events_enabled {
        return Ok(Vec::new());
    }
    let days = benefits_for_tier(&state.hub.user_tier).event_foresight_days;
    if days == 0 {
        return Ok(Vec::new());
    }
    Ok(generate_foresight(&state, days))
}

pub fn generate_foresight(state: &AppState, horizon_days: u32) -> Vec<ForesightEvent> {
    let threshold = match state.settings.event_mode {
        EventMode::Fun => 0.18,
        EventMode::Balanced => 0.1,
        EventMode::Serious => 0.0,
    };
    if threshold <= 0.0 {
        return Vec::new();
    }

    let mut previews = Vec::new();
    for offset in 1..=horizon_days {
        let expected_day = state.day_number + offset;
        let seed = (state.day_number as u64) << 32 | offset as u64;
        let mut rng = StdRng::seed_from_u64(seed);
        let roll: f32 = rng.random();
        if roll > threshold {
            continue;
        }
        let template = event_template(rng.random_range(0..5));
        previews.push(ForesightEvent {
            id: format!("foresight-{expected_day}-{}", template.1),
            title: template.1.to_string(),
            description: template.2.to_string(),
            tone: template.0.to_string(),
            expected_day,
            confidence: (0.55 + (horizon_days - offset) as f32 * 0.12).min(0.95),
            morale_delta: template.3,
            cash_delta: template.4,
        });
    }
    previews
}

fn event_template(index: u32) -> (&'static str, &'static str, &'static str, f32, f64) {
    match index {
        0 => (
            "positive",
            "Viral Agent Post",
            "An agent's update may gain traction and bring in new leads.",
            0.08,
            450.0,
        ),
        1 => (
            "positive",
            "Breakthrough Idea",
            "Engineering may propose a shortcut that accelerates delivery.",
            0.05,
            0.0,
        ),
        2 => (
            "negative",
            "Burnout Warning",
            "A key agent could become exhausted and need recovery time.",
            -0.12,
            -120.0,
        ),
        3 => (
            "chaotic",
            "Office Meme Wave",
            "A meme may distract the team while morale swings upward.",
            0.1,
            -80.0,
        ),
        _ => (
            "positive",
            "Mystery Compute Donation",
            "An anonymous donor might send extra compute credits.",
            0.03,
            300.0,
        ),
    }
}

pub fn maybe_roll_event(state: &mut AppState) -> Option<GameEvent> {
    if !state.settings.random_events_enabled {
        return None;
    }

    let mut rng = rand::rng();
    let roll: f32 = rng.random();
    let threshold = match state.settings.event_mode {
        EventMode::Fun => 0.18,
        EventMode::Balanced => 0.1,
        EventMode::Serious => 0.0,
    };

    if roll > threshold {
        return None;
    }

    let template = event_template(rng.random_range(0..5));
    let event = GameEvent {
        id: Uuid::new_v4().to_string(),
        title: template.1.to_string(),
        description: template.2.to_string(),
        tone: template.0.to_string(),
        morale_delta: template.3,
        cash_delta: template.4,
    };

    apply_event(state, &event);
    Some(event)
}

pub fn apply_event(state: &mut AppState, event: &GameEvent) {
    state.stats.events_triggered += 1;
    state.finance.cash_balance += event.cash_delta;
    for agent in state.agents.values_mut() {
        agent.morale = (agent.morale + event.morale_delta).clamp(0.0, 1.0);
    }
    state.events.push(event.clone());
    if state.events.len() > 30 {
        let overflow = state.events.len() - 30;
        state.events.drain(0..overflow);
    }
}

pub fn apply_god_mode_reality_debt(state: &mut AppState) -> Option<String> {
    if state.god_mode_reality_debt <= 0.0 {
        return None;
    }

    state.god_mode_reality_debt = (state.god_mode_reality_debt - 0.008).max(0.0);
    if state.god_mode_reality_debt < 0.35 {
        return None;
    }

    for agent in state.agents.values_mut() {
        agent.morale = (agent.morale - 0.015).max(0.0);
        agent.energy = (agent.energy - 0.01).max(0.0);
    }

    Some("God Mode reality debt is straining team trust and energy.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppState;

    #[test]
    fn foresight_respects_tier_horizon() {
        let mut state = AppState::default();
        state.hub.user_tier = "pro".to_string();
        state.settings.random_events_enabled = true;
        let previews = generate_foresight(&state, 1);
        assert!(previews.len() <= 1);
        for preview in previews {
            assert_eq!(preview.expected_day, state.day_number + 1);
        }
    }
}