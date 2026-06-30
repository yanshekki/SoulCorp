use crate::soul::SoulProfile;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EventMode {
    Fun,
    Balanced,
    Serious,
}

impl Default for EventMode {
    fn default() -> Self {
        EventMode::Fun
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSettings {
    pub random_events_enabled: bool,
    pub event_mode: EventMode,
    pub god_mode_enabled: bool,
    pub ai_provider: String,
}

impl Default for GameSettings {
    fn default() -> Self {
        Self {
            random_events_enabled: true,
            event_mode: EventMode::Fun,
            god_mode_enabled: true,
            ai_provider: "mock".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRecord {
    pub id: String,
    pub name: String,
    pub role: String,
    pub department: String,
    pub morale: f32,
    pub energy: f32,
    pub salary: f32,
    pub status: String,
    pub soul: Option<SoulProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinanceState {
    pub cash_balance: f64,
    pub compute_tokens: f64,
    pub monthly_burn: f64,
    pub monthly_revenue: f64,
}

impl Default for FinanceState {
    fn default() -> Self {
        Self {
            cash_balance: 10000.0,
            compute_tokens: 5000.0,
            monthly_burn: 1200.0,
            monthly_revenue: 1800.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameEvent {
    pub id: String,
    pub title: String,
    pub description: String,
    pub tone: String,
    pub morale_delta: f32,
    pub cash_delta: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingMessage {
    pub speaker_id: String,
    pub speaker_name: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingState {
    pub id: String,
    pub meeting_type: String,
    pub participant_ids: Vec<String>,
    pub messages: Vec<MeetingMessage>,
    pub turn: usize,
    pub completed: bool,
    pub morale_delta: f32,
}

#[derive(Debug, Default, Clone)]
pub struct AppState {
    pub settings: GameSettings,
    pub finance: FinanceState,
    pub agents: HashMap<String, AgentRecord>,
    pub events: Vec<GameEvent>,
    pub meetings: HashMap<String, MeetingState>,
    pub day_number: u32,
    pub tick: u64,
}

impl AppState {
    pub fn seed_defaults(&mut self) {
        if !self.agents.is_empty() {
            return;
        }

        let defaults = [
            (
                "agent-1",
                "Mira",
                "Senior Dev",
                "Engineering",
                0.82,
                0.9,
                4200.0,
            ),
            (
                "agent-2",
                "Kai",
                "HR Lead",
                "Human Resources",
                0.76,
                0.85,
                3900.0,
            ),
            ("agent-3", "Ren", "COO", "Executive", 0.88, 0.8, 5100.0),
        ];

        for (id, name, role, department, morale, energy, salary) in defaults {
            self.agents.insert(
                id.to_string(),
                AgentRecord {
                    id: id.to_string(),
                    name: name.to_string(),
                    role: role.to_string(),
                    department: department.to_string(),
                    morale,
                    energy,
                    salary,
                    status: "idle".to_string(),
                    soul: None,
                },
            );
        }
    }
}
