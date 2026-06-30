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
    #[serde(default = "default_ollama_base_url")]
    pub ollama_base_url: String,
    #[serde(default = "default_ollama_model")]
    pub ollama_model: String,
    #[serde(default = "default_openai_base_url")]
    pub openai_base_url: String,
    #[serde(default)]
    pub openai_api_key: String,
    #[serde(default = "default_openai_model")]
    pub openai_model: String,
    #[serde(default = "default_grok_base_url")]
    pub grok_base_url: String,
    #[serde(default)]
    pub grok_api_key: String,
    #[serde(default = "default_grok_model")]
    pub grok_model: String,
    #[serde(default = "default_claude_base_url")]
    pub claude_base_url: String,
    #[serde(default)]
    pub claude_api_key: String,
    #[serde(default = "default_claude_model")]
    pub claude_model: String,
    #[serde(default = "default_meeting_turns_per_agent")]
    pub meeting_turns_per_agent: u32,
    #[serde(default = "default_true")]
    pub meeting_llm_fallback: bool,
    pub pure_local_mode: bool,
    pub pixel_filter_enabled: bool,
    pub low_power_mode: bool,
    pub backup_interval_minutes: u32,
}

pub fn default_onboarding_completed() -> bool {
    true
}

fn default_ollama_base_url() -> String {
    "http://127.0.0.1:11434".to_string()
}

fn default_ollama_model() -> String {
    "llama3.2".to_string()
}

fn default_openai_base_url() -> String {
    "https://api.openai.com/v1".to_string()
}

fn default_openai_model() -> String {
    "gpt-4o-mini".to_string()
}

fn default_grok_base_url() -> String {
    "https://api.x.ai/v1".to_string()
}

fn default_grok_model() -> String {
    "grok-2-latest".to_string()
}

fn default_claude_base_url() -> String {
    "https://api.anthropic.com/v1".to_string()
}

fn default_claude_model() -> String {
    "claude-3-5-sonnet-latest".to_string()
}

fn default_meeting_turns_per_agent() -> u32 {
    3
}

fn default_true() -> bool {
    true
}

impl Default for GameSettings {
    fn default() -> Self {
        Self {
            random_events_enabled: true,
            event_mode: EventMode::Fun,
            god_mode_enabled: true,
            ai_provider: "mock".to_string(),
            ollama_base_url: default_ollama_base_url(),
            ollama_model: default_ollama_model(),
            openai_base_url: default_openai_base_url(),
            openai_api_key: String::new(),
            openai_model: default_openai_model(),
            grok_base_url: default_grok_base_url(),
            grok_api_key: String::new(),
            grok_model: default_grok_model(),
            claude_base_url: default_claude_base_url(),
            claude_api_key: String::new(),
            claude_model: default_claude_model(),
            meeting_turns_per_agent: default_meeting_turns_per_agent(),
            meeting_llm_fallback: true,
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
    #[serde(default)]
    pub soul_staked: f64,
    #[serde(default)]
    pub near_wallet_address: Option<String>,
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
            soul_staked: 0.0,
            near_wallet_address: None,
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
    #[serde(default)]
    pub gigs_completed: u32,
    #[serde(default)]
    pub agents_hired: u32,
    #[serde(default)]
    pub interviews_started: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRelationship {
    pub id: String,
    pub from_agent_id: String,
    pub to_agent_id: String,
    pub relationship_type: String,
    pub score: f32,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GigContract {
    pub contract_id: String,
    pub gig_id: u64,
    pub title: String,
    pub description: String,
    pub budget_usdt: f64,
    pub required_skills: Vec<String>,
    pub status: String,
    pub progress: f32,
    pub payout_usdt: f64,
    pub platform_fee_usdt: f64,
    pub accepted_at: String,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub submitted_at: Option<String>,
    #[serde(default)]
    pub completed_at: Option<String>,
    #[serde(default)]
    pub qc_score: Option<f32>,
    #[serde(default)]
    pub qc_notes: Option<String>,
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
    #[serde(default)]
    pub soul_id: Option<u64>,
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
pub struct GodModeBonusRecruit {
    pub id: String,
    pub name: String,
    pub headline: String,
    pub skills: Vec<String>,
    pub vibe: String,
    pub hourly_rate_usdt: f64,
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
    #[serde(default)]
    pub provider: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomDepartment {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub sop: String,
    pub brand_color: String,
    pub accent_color: String,
    pub building_id: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CoCeoState {
    #[serde(default)]
    pub agent_id: Option<String>,
    #[serde(default)]
    pub last_briefing_at: Option<String>,
    #[serde(default)]
    pub last_directive: Option<String>,
    #[serde(default)]
    pub autonomy_enabled: bool,
    #[serde(default)]
    pub directives_applied: u32,
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
    #[serde(default)]
    pub company_name: String,
    #[serde(default = "default_onboarding_completed")]
    pub onboarding_completed: bool,
    pub settings: GameSettings,
    pub finance: FinanceState,
    pub agents: HashMap<String, AgentRecord>,
    pub events: Vec<GameEvent>,
    #[serde(default)]
    pub god_mode_history: Vec<GodModeLogEntry>,
    #[serde(default)]
    pub god_mode_bonus_recruits: Vec<GodModeBonusRecruit>,
    #[serde(default)]
    pub chaos_mode_ticks_remaining: u32,
    #[serde(default)]
    pub god_mode_reality_debt: f32,
    pub meetings: HashMap<String, MeetingState>,
    pub achievements: Vec<Achievement>,
    pub endings: Vec<Ending>,
    pub stats: GameStats,
    pub hub: HubState,
    pub sync_queue: Vec<serde_json::Value>,
    #[serde(default)]
    pub gig_contracts: Vec<GigContract>,
    #[serde(default)]
    pub agent_relationships: Vec<AgentRelationship>,
    #[serde(default)]
    pub custom_departments: Vec<CustomDepartment>,
    #[serde(default)]
    pub co_ceo: CoCeoState,
    #[serde(default)]
    pub projects: Vec<InternalProject>,
    pub day_number: u32,
    pub tick: u64,
    pub last_backup_tick: u64,
    #[serde(default)]
    pub last_deploy_url: Option<String>,
    #[serde(default)]
    pub last_deploy_at: Option<String>,
    #[serde(default)]
    pub last_deploy_provider: Option<String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            company_name: "SoulCorp".to_string(),
            onboarding_completed: false,
            settings: GameSettings::default(),
            finance: FinanceState::default(),
            agents: HashMap::new(),
            events: Vec::new(),
            god_mode_history: Vec::new(),
            god_mode_bonus_recruits: Vec::new(),
            chaos_mode_ticks_remaining: 0,
            god_mode_reality_debt: 0.0,
            meetings: HashMap::new(),
            achievements: Vec::new(),
            endings: Vec::new(),
            stats: GameStats::default(),
            hub: HubState::default(),
            sync_queue: Vec::new(),
            gig_contracts: Vec::new(),
            agent_relationships: Vec::new(),
            custom_departments: Vec::new(),
            co_ceo: CoCeoState::default(),
            projects: Vec::new(),
            day_number: 1,
            tick: 0,
            last_backup_tick: 0,
            last_deploy_url: None,
            last_deploy_at: None,
            last_deploy_provider: None,
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
                    soul_id: None,
                },
            );
        }

        self.seed_projects();
        crate::relationships::seed_default_relationships(self);
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
