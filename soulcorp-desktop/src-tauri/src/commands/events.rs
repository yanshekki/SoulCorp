use crate::state::{AppState, EventMode, GameEvent};
use rand::Rng;
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn get_recent_events(state: State<'_, Mutex<AppState>>) -> Result<Vec<GameEvent>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.events.iter().rev().take(8).cloned().collect())
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

    let event = match rng.random_range(0..5) {
        0 => GameEvent {
            id: Uuid::new_v4().to_string(),
            title: "Viral Agent Post".to_string(),
            description: "An agent's update gained traction and brought in new leads.".to_string(),
            tone: "positive".to_string(),
            morale_delta: 0.08,
            cash_delta: 450.0,
        },
        1 => GameEvent {
            id: Uuid::new_v4().to_string(),
            title: "Breakthrough Idea".to_string(),
            description: "Engineering proposed a shortcut that accelerates delivery.".to_string(),
            tone: "positive".to_string(),
            morale_delta: 0.05,
            cash_delta: 0.0,
        },
        2 => GameEvent {
            id: Uuid::new_v4().to_string(),
            title: "Burnout Warning".to_string(),
            description: "A key agent is exhausted and needs recovery time.".to_string(),
            tone: "negative".to_string(),
            morale_delta: -0.12,
            cash_delta: -120.0,
        },
        3 => GameEvent {
            id: Uuid::new_v4().to_string(),
            title: "Office Meme Wave".to_string(),
            description: "Everyone is distracted by a meme, but morale is strangely high."
                .to_string(),
            tone: "chaotic".to_string(),
            morale_delta: 0.1,
            cash_delta: -80.0,
        },
        _ => GameEvent {
            id: Uuid::new_v4().to_string(),
            title: "Mystery Compute Donation".to_string(),
            description: "An anonymous donor sent extra compute credits.".to_string(),
            tone: "positive".to_string(),
            morale_delta: 0.03,
            cash_delta: 300.0,
        },
    };

    apply_event(state, &event);
    Some(event)
}

pub fn apply_event(state: &mut AppState, event: &GameEvent) {
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
