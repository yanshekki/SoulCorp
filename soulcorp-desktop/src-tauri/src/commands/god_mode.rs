use crate::commands::events::apply_event;
use crate::db::persistence::commit;
use crate::state::{AppState, GameEvent, GodModeLogEntry};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GodModeActionResult {
    pub action: String,
    pub message: String,
    pub day_number: u32,
    pub cash_balance: f64,
    pub average_morale: f32,
}

fn ensure_enabled(state: &AppState) -> Result<(), String> {
    if state.settings.god_mode_enabled {
        Ok(())
    } else {
        Err("God Mode is disabled in settings.".to_string())
    }
}

fn record_use(state: &mut AppState, action: &str, message: String, reality_cost: f32) -> GodModeActionResult {
    state.stats.god_mode_uses += 1;
    state.god_mode_reality_debt = (state.god_mode_reality_debt + reality_cost).min(1.0);
    state.god_mode_history.push(GodModeLogEntry {
        id: Uuid::new_v4().to_string(),
        action: action.to_string(),
        message: message.clone(),
        day_number: state.day_number,
        reality_cost,
    });
    if state.god_mode_history.len() > 50 {
        let overflow = state.god_mode_history.len() - 50;
        state.god_mode_history.drain(0..overflow);
    }
    build_result(state, action, message)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GodModeStatus {
    pub reality_debt: f32,
}

#[tauri::command]
pub fn get_god_mode_status(state: State<'_, Mutex<AppState>>) -> Result<GodModeStatus, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(GodModeStatus {
        reality_debt: state.god_mode_reality_debt,
    })
}

#[tauri::command]
pub fn get_god_mode_history(
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<GodModeLogEntry>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.god_mode_history.iter().rev().take(12).cloned().collect())
}

#[tauri::command]
pub fn god_mode_time_warp(
    days: u32,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GodModeActionResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_enabled(&state)?;

    let days = days.max(1);
    state.day_number += days;
    state.finance.monthly_burn *= 1.02;
    state.finance.monthly_revenue *= 1.03;
    state.finance.cash_balance += state.finance.monthly_revenue * (days as f64 / 30.0);
    state.finance.compute_tokens -= state.finance.monthly_burn * 0.05;

    let result = record_use(
        &mut state,
        "time_warp",
        format!("Time warped forward by {days} day(s)."),
        0.08,
    );
    commit(app, &state)?;
    Ok(result)
}

#[tauri::command]
pub fn god_mode_mass_motivation(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GodModeActionResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_enabled(&state)?;

    for agent in state.agents.values_mut() {
        agent.morale = (agent.morale + 0.15).min(1.0);
        agent.energy = (agent.energy + 0.1).min(1.0);
    }

    let result = record_use(
        &mut state,
        "mass_motivation",
        "Company-wide morale and energy received a divine boost.".to_string(),
        0.05,
    );
    commit(app, &state)?;
    Ok(result)
}

#[tauri::command]
pub fn god_mode_emergency_budget(
    amount: f64,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GodModeActionResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_enabled(&state)?;

    let amount = amount.max(0.0);
    state.finance.cash_balance += amount;
    state.finance.compute_tokens += amount * 0.4;

    let result = record_use(
        &mut state,
        "emergency_budget",
        format!("Injected ${amount:.0} into the company budget."),
        0.06,
    );
    commit(app, &state)?;
    Ok(result)
}

#[tauri::command]
pub fn god_mode_divine_inspiration(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GodModeActionResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_enabled(&state)?;

    for agent in state.agents.values_mut() {
        agent.energy = (agent.energy + 0.2).min(1.0);
        agent.morale = (agent.morale + 0.08).min(1.0);
        agent.status = "inspired".to_string();
    }
    if let Some(project) = state.projects.iter_mut().find(|p| p.priority == 1) {
        project.progress = (project.progress + 0.05).min(1.0);
    }

    let result = record_use(
        &mut state,
        "divine_inspiration",
        "All agents received a burst of creativity and delivery speed.".to_string(),
        0.04,
    );
    commit(app, &state)?;
    Ok(result)
}

#[tauri::command]
pub fn god_mode_black_swan(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GodModeActionResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_enabled(&state)?;

    let mut rng = rand::rng();
    let event = match rng.random_range(0..4) {
        0 => GameEvent {
            id: Uuid::new_v4().to_string(),
            title: "Regulatory Shock".to_string(),
            description: "A surprise audit rattled the company, but exposed a cost-saving fix."
                .to_string(),
            tone: "chaotic".to_string(),
            morale_delta: -0.06,
            cash_delta: -900.0,
        },
        1 => GameEvent {
            id: Uuid::new_v4().to_string(),
            title: "Viral Product Moment".to_string(),
            description: "A black-swan spike in demand flooded inbound leads.".to_string(),
            tone: "positive".to_string(),
            morale_delta: 0.12,
            cash_delta: 2200.0,
        },
        2 => GameEvent {
            id: Uuid::new_v4().to_string(),
            title: "Key Resignation Scare".to_string(),
            description: "A top agent threatened to leave, forcing a retention scramble.".to_string(),
            tone: "negative".to_string(),
            morale_delta: -0.14,
            cash_delta: -600.0,
        },
        _ => GameEvent {
            id: Uuid::new_v4().to_string(),
            title: "Mystery Acquisition Offer".to_string(),
            description: "An unsolicited offer created chaos and ambition in equal measure."
                .to_string(),
            tone: "chaotic".to_string(),
            morale_delta: 0.05,
            cash_delta: 1500.0,
        },
    };
    let summary = format!("{} — {}", event.title, event.description);
    apply_event(&mut state, &event);

    let result = record_use(&mut state, "black_swan", summary, 0.12);
    commit(app, &state)?;
    Ok(result)
}

#[tauri::command]
pub fn god_mode_agent_mutation(
    agent_id: Option<String>,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GodModeActionResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_enabled(&state)?;

    let target_id = agent_id.unwrap_or_else(|| {
        let mut rng = rand::rng();
        let ids: Vec<String> = state.agents.keys().cloned().collect();
        ids[rng.random_range(0..ids.len())].clone()
    });

    let mut rng = rand::rng();
    let mutations = ["Visionary", "Perfectionist", "Chaos Agent", "Stoic", "Hyperfocus"];
    let new_trait = mutations[rng.random_range(0..mutations.len())];
    let agent_name = {
        let agent = state
            .agents
            .get_mut(&target_id)
            .ok_or_else(|| format!("Agent '{target_id}' not found."))?;
        let base_role = agent.role.split(" (").next().unwrap_or(&agent.role).to_string();
        agent.role = format!("{base_role} ({new_trait})");
        agent.morale = (agent.morale + rng.random_range(-0.15..0.2)).clamp(0.0, 1.0);
        agent.energy = (agent.energy + rng.random_range(-0.1..0.15)).clamp(0.0, 1.0);
        agent.name.clone()
    };

    let result = record_use(
        &mut state,
        "agent_mutation",
        format!("{agent_name} mutated into a {new_trait} personality."),
        0.1,
    );
    commit(app, &state)?;
    Ok(result)
}

#[tauri::command]
pub fn god_mode_reality_edit(
    project_id: Option<String>,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GodModeActionResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_enabled(&state)?;

    let title = if let Some(id) = project_id {
        let project = state
            .projects
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or_else(|| format!("Project '{id}' not found."))?;
        project.progress = (project.progress + 0.18).min(1.0);
        project.title.clone()
    } else {
        let project = state
            .projects
            .iter_mut()
            .min_by_key(|p| p.priority)
            .ok_or_else(|| "No projects available to edit.".to_string())?;
        project.progress = (project.progress + 0.18).min(1.0);
        project.title.clone()
    };
    state.finance.monthly_revenue *= 1.04;

    let result = record_use(
        &mut state,
        "reality_edit",
        format!("Reality bent: \"{title}\" jumped ahead in the timeline."),
        0.09,
    );
    commit(app, &state)?;
    Ok(result)
}

#[tauri::command]
pub fn god_mode_perfect_hiring(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GodModeActionResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_enabled(&state)?;

    let recruit = crate::state::GodModeBonusRecruit {
        id: format!("god-cand-{}", Uuid::new_v4()),
        name: "Nova Sterling".to_string(),
        headline: "Hidden S-tier operator revealed by divine scouting".to_string(),
        skills: vec![
            "strategy".into(),
            "execution".into(),
            "ai-systems".into(),
            "leadership".into(),
        ],
        vibe: "legendary".to_string(),
        hourly_rate_usdt: 72.0,
    };
    let summary = format!(
        "{} is now visible in Recruitment with premium potential.",
        recruit.name
    );
    state.god_mode_bonus_recruits.push(recruit);

    let result = record_use(&mut state, "perfect_hiring", summary, 0.07);
    commit(app, &state)?;
    Ok(result)
}

#[tauri::command]
pub fn god_mode_total_chaos(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GodModeActionResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_enabled(&state)?;

    let moods = ["chaotic", "euphoric", "paranoid", "lazy", "hyper", "dramatic"];
    let mut rng = rand::rng();
    for agent in state.agents.values_mut() {
        let mood = moods[rng.random_range(0..moods.len())];
        agent.status = format!("chaos:{mood}");
        agent.morale = (agent.morale + rng.random_range(-0.25..0.25)).clamp(0.05, 1.0);
        agent.energy = (agent.energy + rng.random_range(-0.3..0.3)).clamp(0.05, 1.0);
    }
    state.chaos_mode_ticks_remaining = 24 * 60;

    let result = record_use(
        &mut state,
        "total_chaos",
        "Total Chaos Mode activated for 24 simulated hours.".to_string(),
        0.15,
    );
    commit(app, &state)?;
    Ok(result)
}

#[tauri::command]
pub fn god_mode_reset_agent_memory(
    agent_id: Option<String>,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GodModeActionResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_enabled(&state)?;

    let target_id = agent_id.unwrap_or_else(|| {
        let mut rng = rand::rng();
        let ids: Vec<String> = state.agents.keys().cloned().collect();
        ids[rng.random_range(0..ids.len())].clone()
    });

    let agent_name = {
        let agent = state
            .agents
            .get_mut(&target_id)
            .ok_or_else(|| format!("Agent '{target_id}' not found."))?;
        agent.soul = None;
        agent.role = agent.role.split(" (").next().unwrap_or(&agent.role).to_string();
        agent.status = "disoriented".to_string();
        agent.morale = (agent.morale - 0.2).max(0.1);
        agent.energy = (agent.energy - 0.15).max(0.1);
        agent.name.clone()
    };

    let result = record_use(
        &mut state,
        "reset_agent_memory",
        format!("{agent_name}'s memory was wiped. They feel lost but unburdened."),
        0.14,
    );
    commit(app, &state)?;
    Ok(result)
}

#[tauri::command]
pub fn god_mode_force_relationship(
    relationship_type: Option<String>,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GodModeActionResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    ensure_enabled(&state)?;

    let ids: Vec<String> = state.agents.keys().cloned().collect();
    if ids.len() < 2 {
        return Err("Need at least two agents to force a relationship.".to_string());
    }

    let mut rng = rand::rng();
    let first = ids[rng.random_range(0..ids.len())].clone();
    let mut second = ids[rng.random_range(0..ids.len())].clone();
    if first == second {
        second = ids[(rng.random_range(0..ids.len()) + 1) % ids.len()].clone();
    }

    let relationship = match relationship_type.as_deref() {
        Some("rivalry") | Some("rival") => "rivalry",
        _ => "romance",
    };

    let first_name = state.agents.get(&first).map(|a| a.name.clone()).unwrap_or(first.clone());
    let second_name = state
        .agents
        .get(&second)
        .map(|a| a.name.clone())
        .unwrap_or(second.clone());

    if let Some(agent) = state.agents.get_mut(&first) {
        agent.status = format!("{relationship}_with:{second_name}");
        agent.morale = (agent.morale + 0.05).min(1.0);
    }
    if let Some(agent) = state.agents.get_mut(&second) {
        agent.status = format!("{relationship}_with:{first_name}");
        agent.morale = (agent.morale + if relationship == "romance" { 0.08 } else { -0.05 }).clamp(0.0, 1.0);
    }

    let score = if relationship == "romance" { 0.88 } else { -0.42 };
    crate::relationships::upsert_relationship(&mut state, &first, &second, relationship, score);

    let result = record_use(
        &mut state,
        "force_relationship",
        format!("Forced {relationship} between {first_name} and {second_name}."),
        0.13,
    );
    commit(app, &state)?;
    Ok(result)
}

pub fn apply_chaos_mode_tick(state: &mut AppState) {
    if state.chaos_mode_ticks_remaining == 0 {
        return;
    }
    state.chaos_mode_ticks_remaining = state.chaos_mode_ticks_remaining.saturating_sub(1);
    let mut rng = rand::rng();
    for agent in state.agents.values_mut() {
        if agent.status.starts_with("chaos:") {
            agent.morale = (agent.morale + rng.random_range(-0.08..0.08)).clamp(0.05, 1.0);
            agent.energy = (agent.energy + rng.random_range(-0.1..0.1)).clamp(0.05, 1.0);
        }
    }
}

fn build_result(state: &AppState, action: &str, message: String) -> GodModeActionResult {
    let morale_sum: f32 = state.agents.values().map(|agent| agent.morale).sum();
    let average_morale = if state.agents.is_empty() {
        0.0
    } else {
        morale_sum / state.agents.len() as f32
    };

    GodModeActionResult {
        action: action.to_string(),
        message,
        day_number: state.day_number,
        cash_balance: state.finance.cash_balance,
        average_morale,
    }
}