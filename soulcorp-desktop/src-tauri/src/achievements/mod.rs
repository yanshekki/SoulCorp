use crate::state::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Achievement {
    pub id: String,
    pub title: String,
    pub description: String,
    pub category: String,
    pub unlocked: bool,
    pub unlocked_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ending {
    pub id: String,
    pub title: String,
    pub description: String,
    pub unlocked: bool,
    pub unlocked_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AchievementSnapshot {
    pub achievements: Vec<Achievement>,
    pub endings: Vec<Ending>,
    pub newly_unlocked: Vec<String>,
}

pub fn default_achievements() -> Vec<Achievement> {
    vec![
        Achievement {
            id: "three_agents".into(),
            title: "Core Team Online".into(),
            description: "Run a company with at least 3 agents.".into(),
            category: "growth".into(),
            unlocked: false,
            unlocked_at: None,
        },
        Achievement {
            id: "first_meeting".into(),
            title: "Call to Order".into(),
            description: "Complete your first multi-agent meeting.".into(),
            category: "culture".into(),
            unlocked: false,
            unlocked_at: None,
        },
        Achievement {
            id: "serious_mode".into(),
            title: "Serious Work Mode".into(),
            description: "Switch to Serious Work Mode for pure productivity.".into(),
            category: "productivity".into(),
            unlocked: false,
            unlocked_at: None,
        },
        Achievement {
            id: "pure_local".into(),
            title: "Pure Local Mode".into(),
            description: "Disable all cloud-oriented features.".into(),
            category: "offline".into(),
            unlocked: false,
            unlocked_at: None,
        },
        Achievement {
            id: "god_mode_user".into(),
            title: "Divine Intervention".into(),
            description: "Use God Mode at least once.".into(),
            category: "god_mode".into(),
            unlocked: false,
            unlocked_at: None,
        },
        Achievement {
            id: "event_survivor".into(),
            title: "Event Survivor".into(),
            description: "Experience 5 random events.".into(),
            category: "chaos".into(),
            unlocked: false,
            unlocked_at: None,
        },
        Achievement {
            id: "profitable_month".into(),
            title: "In the Black".into(),
            description: "Reach a month where revenue exceeds burn.".into(),
            category: "economic".into(),
            unlocked: false,
            unlocked_at: None,
        },
        Achievement {
            id: "workspace_builder".into(),
            title: "Workspace Builder".into(),
            description: "Create at least 5 workspace pages.".into(),
            category: "productivity".into(),
            unlocked: false,
            unlocked_at: None,
        },
    ]
}

pub fn default_endings() -> Vec<Ending> {
    vec![
        Ending {
            id: "profitable_exit".into(),
            title: "Profitable Exit".into(),
            description: "Grow company cash reserves beyond $50,000.".into(),
            unlocked: false,
            unlocked_at: None,
        },
        Ending {
            id: "legacy_builder".into(),
            title: "Legacy Builder".into(),
            description: "Guide the company past day 100.".into(),
            unlocked: false,
            unlocked_at: None,
        },
        Ending {
            id: "maximum_chaos".into(),
            title: "Maximum Chaos".into(),
            description: "Survive 20 random events in Fun Mode.".into(),
            unlocked: false,
            unlocked_at: None,
        },
    ]
}

pub fn evaluate(state: &mut AppState) -> AchievementSnapshot {
    if state.achievements.is_empty() {
        state.achievements = default_achievements();
    }
    if state.endings.is_empty() {
        state.endings = default_endings();
    }

    let mut newly_unlocked = Vec::new();
    let now = Utc::now().to_rfc3339();

    let checks: Vec<(&str, bool)> = vec![
        ("three_agents", state.agents.len() >= 3),
        ("first_meeting", state.stats.meetings_completed >= 1),
        (
            "serious_mode",
            state.settings.event_mode == crate::state::EventMode::Serious,
        ),
        ("pure_local", state.settings.pure_local_mode),
        ("god_mode_user", state.stats.god_mode_uses >= 1),
        ("event_survivor", state.stats.events_triggered >= 5),
        (
            "profitable_month",
            state.finance.monthly_revenue > state.finance.monthly_burn,
        ),
        ("workspace_builder", state.stats.pages_created >= 5),
    ];

    for (id, condition) in checks {
        if condition {
            unlock_achievement(state, id, &now, &mut newly_unlocked);
        }
    }

    if state.finance.cash_balance >= 50_000.0 {
        unlock_ending(state, "profitable_exit", &now, &mut newly_unlocked);
    }
    if state.day_number >= 100 {
        unlock_ending(state, "legacy_builder", &now, &mut newly_unlocked);
    }
    if state.stats.events_triggered >= 20
        && state.settings.event_mode == crate::state::EventMode::Fun
    {
        unlock_ending(state, "maximum_chaos", &now, &mut newly_unlocked);
    }

    AchievementSnapshot {
        achievements: state.achievements.clone(),
        endings: state.endings.clone(),
        newly_unlocked,
    }
}

fn unlock_achievement(state: &mut AppState, id: &str, now: &str, newly_unlocked: &mut Vec<String>) {
    if let Some(achievement) = state.achievements.iter_mut().find(|a| a.id == id) {
        if !achievement.unlocked {
            achievement.unlocked = true;
            achievement.unlocked_at = Some(now.to_string());
            newly_unlocked.push(id.to_string());
        }
    }
}

fn unlock_ending(state: &mut AppState, id: &str, now: &str, newly_unlocked: &mut Vec<String>) {
    if let Some(ending) = state.endings.iter_mut().find(|e| e.id == id) {
        if !ending.unlocked {
            ending.unlocked = true;
            ending.unlocked_at = Some(now.to_string());
            newly_unlocked.push(format!("ending:{id}"));
        }
    }
}
