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
            id: "work_mode".into(),
            title: "Work Mode".into(),
            description: "Switch to Work Mode for pure productivity.".into(),
            category: "productivity".into(),
            unlocked: false,
            unlocked_at: None,
        },
        Achievement {
            id: "meet_fate".into(),
            title: "Meet Fate".into(),
            description: "Run Game Mode with Fate watching over your company.".into(),
            category: "chaos".into(),
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
        Achievement {
            id: "first_export".into(),
            title: "Ship It".into(),
            description: "Export your first backup, report, or deliverable.".into(),
            category: "productivity".into(),
            unlocked: false,
            unlocked_at: None,
        },
        Achievement {
            id: "export_artisan".into(),
            title: "Export Artisan".into(),
            description: "Create at least 5 exports.".into(),
            category: "productivity".into(),
            unlocked: false,
            unlocked_at: None,
        },
        Achievement {
            id: "ten_agents".into(),
            title: "Growing Team".into(),
            description: "Run a company with at least 10 agents.".into(),
            category: "growth".into(),
            unlocked: false,
            unlocked_at: None,
        },
        Achievement {
            id: "gig_finisher".into(),
            title: "Gig Finisher".into(),
            description: "Complete your first gig contract.".into(),
            category: "economic".into(),
            unlocked: false,
            unlocked_at: None,
        },
        Achievement {
            id: "auto_backup".into(),
            title: "Backup Guardian".into(),
            description: "Enable periodic auto-backup in settings.".into(),
            category: "offline".into(),
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
        Ending {
            id: "self_sustaining".into(),
            title: "Self-Sustaining Collective".into(),
            description: "Complete 10 gigs with a team of at least 5 agents.".into(),
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
        ("ten_agents", state.agents.len() >= 10),
        ("first_meeting", state.stats.meetings_completed >= 1),
        (
            "work_mode",
            state.settings.play_mode == crate::state::PlayMode::Work,
        ),
        (
            "meet_fate",
            state.settings.play_mode == crate::state::PlayMode::Game
                && state.agents.contains_key(crate::fate::FATE_AGENT_ID),
        ),
        ("pure_local", state.settings.pure_local_mode),
        ("god_mode_user", state.stats.god_mode_uses >= 1),
        ("event_survivor", state.stats.events_triggered >= 5),
        (
            "profitable_month",
            state.token_economy.monthly_inflow_tokens > state.token_economy.monthly_burn_tokens,
        ),
        ("workspace_builder", state.stats.pages_created >= 5),
        ("first_export", state.stats.exports_created >= 1),
        ("export_artisan", state.stats.exports_created >= 5),
        ("gig_finisher", state.stats.gigs_completed >= 1),
        ("auto_backup", state.settings.backup_interval_minutes > 0),
    ];

    for (id, condition) in checks {
        if condition {
            unlock_achievement(state, id, &now, &mut newly_unlocked);
        }
    }

    if state.token_economy.company_balance >= 50_000 {
        unlock_ending(state, "profitable_exit", &now, &mut newly_unlocked);
    }
    if state.day_number >= 100 {
        unlock_ending(state, "legacy_builder", &now, &mut newly_unlocked);
    }
    if state.stats.events_triggered >= 20
        && state.settings.play_mode == crate::state::PlayMode::Game
    {
        unlock_ending(state, "maximum_chaos", &now, &mut newly_unlocked);
    }
    if state.stats.gigs_completed >= 10 && state.agents.len() >= 5 {
        unlock_ending(state, "self_sustaining", &now, &mut newly_unlocked);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{AppState, GameSettings, PlayMode};

    fn sample_state() -> AppState {
        let mut state = AppState::default();
        state.settings = GameSettings::default();
        state
    }

    #[test]
    fn unlocks_first_export_when_exports_exist() {
        let mut state = sample_state();
        state.stats.exports_created = 1;
        let snapshot = evaluate(&mut state);
        assert!(snapshot
            .achievements
            .iter()
            .find(|item| item.id == "first_export")
            .is_some_and(|item| item.unlocked));
        assert!(snapshot.newly_unlocked.contains(&"first_export".to_string()));
    }

    #[test]
    fn unlocks_self_sustaining_ending_for_gig_milestones() {
        let mut state = sample_state();
        state.stats.gigs_completed = 10;
        for index in 1..=5 {
            let id = format!("a{index}");
            state.agents.insert(
                id.clone(),
                crate::state::AgentRecord {
                    id,
                    name: format!("Agent {index}"),
                    role: "Engineer".into(),
                    department: "Engineering".into(),
                    morale: 0.8,
                    energy: 0.8,
                    salary: 1000.0,
                    status: "idle".into(),
                    soul: None,
                    soul_id: None,
                    ai_provider: None,
                    agent_kind: None,
                    skills: crate::state::skills_for_role("Engineer"),
                    reports_to: None,
                    manages_department: None,
                },
            );
        }
        let snapshot = evaluate(&mut state);
        assert!(snapshot
            .endings
            .iter()
            .find(|item| item.id == "self_sustaining")
            .is_some_and(|item| item.unlocked));
    }

    #[test]
    fn work_mode_unlocks_work_mode_achievement() {
        let mut state = sample_state();
        state.settings.play_mode = PlayMode::Work;
        let snapshot = evaluate(&mut state);
        assert!(snapshot
            .achievements
            .iter()
            .find(|item| item.id == "work_mode")
            .is_some_and(|item| item.unlocked));
    }
}
