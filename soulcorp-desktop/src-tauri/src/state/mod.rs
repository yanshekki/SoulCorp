use crate::achievements::{Achievement, Ending};
use crate::soul::SoulProfile;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
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
    pub pure_local_mode: bool,
    pub pixel_filter_enabled: bool,
    pub low_power_mode: bool,
    pub backup_interval_minutes: u32,
}

impl Default for GameSettings {
    fn default() -> Self {
        Self {
            random_events_enabled: true,
            event_mode: EventMode::Fun,
            god_mode_enabled: true,
            ai_provider: "mock".to_string(),
            pure_local_mode: false,
            pixel_filter_enabled: false,
            low_power_mode: false,
            backup_interval_minutes: 30,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubState {
    pub connected: bool,
    pub base_url: String,
    pub api_key: Option<String>,
    pub user_tier: String,
    pub soul_balance: f64,
    pub last_sync_at: Option<String>,
}

impl Default for HubState {
    fn default() -> Self {
        Self {
            connected: false,
            base_url: "https://soulmd-hub.ysk.hk".to_string(),
            api_key: None,
            user_tier: "free".to_string(),
            soul_balance: 0.0,
            last_sync_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GameStats {
    pub meetings_completed: u32,
    pub events_triggered: u32,
    pub god_mode_uses: u32,
    pub pages_created: u32,
    pub exports_created: u32,
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
pub struct BudgetAllocations {
    pub compute_pct: f32,
    pub salaries_pct: f32,
    pub marketing_pct: f32,
    pub rnd_pct: f32,
}

impl Default for BudgetAllocations {
    fn default() -> Self {
        Self {
            compute_pct: 40.0,
            salaries_pct: 35.0,
            marketing_pct: 15.0,
            rnd_pct: 10.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinanceState {
    pub cash_balance: f64,
    pub compute_tokens: f64,
    pub monthly_burn: f64,
    pub monthly_revenue: f64,
    #[serde(default)]
    pub allocations: BudgetAllocations,
    #[serde(default)]
    pub compute_starved: bool,
    #[serde(default)]
    pub cash_crisis: bool,
}

impl Default for FinanceState {
    fn default() -> Self {
        Self {
            cash_balance: 10000.0,
            compute_tokens: 5000.0,
            monthly_burn: 1200.0,
            monthly_revenue: 1800.0,
            allocations: BudgetAllocations::default(),
            compute_starved: false,
            cash_crisis: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InternalProject {
    pub id: String,
    pub title: String,
    pub progress: f32,
    pub priority: u8,
    #[serde(default)]
    pub owner_department: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GodModeLogEntry {
    pub id: String,
    pub action: String,
    pub message: String,
    pub day_number: u32,
    pub reality_cost: f32,
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
    #[serde(default)]
    pub outcome_summary: Option<String>,
    #[serde(default)]
    pub project_progress_delta: f32,
    #[serde(default)]
    pub revenue_delta: f64,
    #[serde(default)]
    pub notes_generated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub settings: GameSettings,
    pub finance: FinanceState,
    pub agents: HashMap<String, AgentRecord>,
    pub events: Vec<GameEvent>,
    #[serde(default)]
    pub god_mode_history: Vec<GodModeLogEntry>,
    pub meetings: HashMap<String, MeetingState>,
    pub achievements: Vec<Achievement>,
    pub endings: Vec<Ending>,
    pub stats: GameStats,
    pub hub: HubState,
    pub sync_queue: Vec<serde_json::Value>,
    #[serde(default)]
    pub projects: Vec<InternalProject>,
    pub day_number: u32,
    pub tick: u64,
    pub last_backup_tick: u64,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            settings: GameSettings::default(),
            finance: FinanceState::default(),
            agents: HashMap::new(),
            events: Vec::new(),
            god_mode_history: Vec::new(),
            meetings: HashMap::new(),
            achievements: Vec::new(),
            endings: Vec::new(),
            stats: GameStats::default(),
            hub: HubState::default(),
            sync_queue: Vec::new(),
            projects: Vec::new(),
            day_number: 1,
            tick: 0,
            last_backup_tick: 0,
        }
    }
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

        self.seed_projects();
        self.finance.monthly_burn = self
            .agents
            .values()
            .map(|agent| agent.salary as f64)
            .sum::<f64>()
            + self.agents.len() as f64 * 75.0;
    }

    pub fn seed_projects(&mut self) {
        if !self.projects.is_empty() {
            return;
        }
        self.projects = vec![
            InternalProject {
                id: "proj-core".into(),
                title: "SoulCorp Core Platform".into(),
                progress: 0.35,
                priority: 1,
                owner_department: "Engineering".into(),
            },
            InternalProject {
                id: "proj-hr".into(),
                title: "Team Culture Program".into(),
                progress: 0.2,
                priority: 2,
                owner_department: "Human Resources".into(),
            },
        ];
    }
}
