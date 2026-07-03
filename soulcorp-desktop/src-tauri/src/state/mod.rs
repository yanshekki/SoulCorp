mod agent_roster;
mod companies;
pub mod visual_design;

pub use agent_roster::{
    default_agent_roster, validate_agent_roster, AgentSlotMode, AgentSlotSetup,
};

use crate::achievements::{Achievement, Ending};
use crate::soul::SoulProfile;
pub use companies::{
    fresh_company_state, summary_from_state, CompanyRegistry, CompanySummary,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PlayMode {
    Game,
    Work,
}

impl Default for PlayMode {
    fn default() -> Self {
        PlayMode::Game
    }
}

fn default_random_event_chance() -> f32 {
    crate::fate::DEFAULT_EVENT_CHANCE
}

#[derive(Debug, Clone, Serialize)]
pub struct GameSettings {
    #[serde(default)]
    pub play_mode: PlayMode,
    pub random_events_enabled: bool,
    #[serde(default = "default_random_event_chance")]
    pub random_event_chance: f32,
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
    #[serde(default)]
    pub crt_filter_enabled: bool,
    pub low_power_mode: bool,
    pub backup_interval_minutes: u32,
    #[serde(default = "default_music_enabled")]
    pub music_enabled: bool,
    #[serde(default = "default_music_volume")]
    pub music_volume: f32,
    #[serde(default = "default_sfx_enabled")]
    pub sfx_enabled: bool,
    #[serde(default = "default_sfx_volume")]
    pub sfx_volume: f32,
    #[serde(default = "default_true")]
    pub scrum_auto_schedule: bool,
    #[serde(default = "default_true")]
    pub scrum_auto_execute: bool,
    #[serde(default)]
    pub scrum_execution_paused: bool,
    #[serde(default)]
    pub scrum_min_tokens_guard: u64,
    #[serde(default = "default_max_executions_per_tick")]
    pub scrum_max_executions_per_tick: u32,
    #[serde(default = "default_true")]
    pub scrum_worker_enabled: bool,
    #[serde(default = "default_worker_interval")]
    pub scrum_worker_interval_secs: u32,
    #[serde(default = "default_true")]
    pub scrum_auto_route: bool,
    #[serde(default = "default_true")]
    pub scrum_auto_approve: bool,
    #[serde(default)]
    pub scrum_parallel_agents: bool,
    #[serde(default = "default_true")]
    pub scrum_auto_retry_blocked: bool,
    #[serde(default = "default_max_blocked_retries")]
    pub scrum_max_blocked_retries: u8,
    #[serde(default)]
    pub scrum_use_agent_tools: bool,
}

fn default_worker_interval() -> u32 {
    30
}

fn default_max_blocked_retries() -> u8 {
    2
}

fn default_max_executions_per_tick() -> u32 {
    1
}

fn default_music_enabled() -> bool {
    true
}

fn default_music_volume() -> f32 {
    0.25
}

fn default_sfx_enabled() -> bool {
    true
}

fn default_sfx_volume() -> f32 {
    0.45
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

pub fn migrate_legacy_event_mode(
    play_mode: Option<PlayMode>,
    legacy_event_mode: Option<&str>,
    chance: f32,
    random_events_enabled: bool,
) -> (PlayMode, f32, bool) {
    if let Some(mode) = play_mode {
        return (mode, crate::fate::clamp_event_chance(chance), random_events_enabled);
    }
    match legacy_event_mode.unwrap_or("fun") {
        "serious" => (PlayMode::Work, 0.0, false),
        "balanced" => (PlayMode::Game, 0.10, random_events_enabled),
        _ => (PlayMode::Game, 0.18, random_events_enabled),
    }
}

impl<'de> Deserialize<'de> for GameSettings {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct Helper {
            #[serde(default)]
            play_mode: Option<PlayMode>,
            #[serde(default = "default_true")]
            random_events_enabled: bool,
            #[serde(default = "default_random_event_chance")]
            random_event_chance: f32,
            #[serde(default)]
            event_mode: Option<String>,
            #[serde(default)]
            god_mode_enabled: bool,
            #[serde(default = "default_ai_provider")]
            ai_provider: String,
            #[serde(default = "default_ollama_base_url")]
            ollama_base_url: String,
            #[serde(default = "default_ollama_model")]
            ollama_model: String,
            #[serde(default = "default_openai_base_url")]
            openai_base_url: String,
            #[serde(default)]
            openai_api_key: String,
            #[serde(default = "default_openai_model")]
            openai_model: String,
            #[serde(default = "default_grok_base_url")]
            grok_base_url: String,
            #[serde(default)]
            grok_api_key: String,
            #[serde(default = "default_grok_model")]
            grok_model: String,
            #[serde(default = "default_claude_base_url")]
            claude_base_url: String,
            #[serde(default)]
            claude_api_key: String,
            #[serde(default = "default_claude_model")]
            claude_model: String,
            #[serde(default = "default_meeting_turns_per_agent")]
            meeting_turns_per_agent: u32,
            #[serde(default = "default_true")]
            meeting_llm_fallback: bool,
            #[serde(default)]
            pure_local_mode: bool,
            #[serde(default)]
            pixel_filter_enabled: bool,
            #[serde(default)]
            crt_filter_enabled: bool,
            #[serde(default)]
            low_power_mode: bool,
            #[serde(default = "default_backup_interval")]
            backup_interval_minutes: u32,
            #[serde(default = "default_music_enabled")]
            music_enabled: bool,
            #[serde(default = "default_music_volume")]
            music_volume: f32,
            #[serde(default = "default_sfx_enabled")]
            sfx_enabled: bool,
            #[serde(default = "default_sfx_volume")]
            sfx_volume: f32,
            #[serde(default = "default_true")]
            scrum_auto_schedule: bool,
            #[serde(default = "default_true")]
            scrum_auto_execute: bool,
            #[serde(default)]
            scrum_execution_paused: bool,
            #[serde(default)]
            scrum_min_tokens_guard: u64,
            #[serde(default = "default_max_executions_per_tick")]
            scrum_max_executions_per_tick: u32,
            #[serde(default = "default_true")]
            scrum_worker_enabled: bool,
            #[serde(default = "default_worker_interval")]
            scrum_worker_interval_secs: u32,
            #[serde(default = "default_true")]
            scrum_auto_route: bool,
            #[serde(default = "default_true")]
            scrum_auto_approve: bool,
            #[serde(default)]
            scrum_parallel_agents: bool,
            #[serde(default = "default_true")]
            scrum_auto_retry_blocked: bool,
            #[serde(default = "default_max_blocked_retries")]
            scrum_max_blocked_retries: u8,
            #[serde(default)]
            scrum_use_agent_tools: bool,
        }

        let helper = Helper::deserialize(deserializer)?;
        let (play_mode, random_event_chance, random_events_enabled) = migrate_legacy_event_mode(
            helper.play_mode,
            helper.event_mode.as_deref(),
            helper.random_event_chance,
            helper.random_events_enabled,
        );

        Ok(Self {
            play_mode,
            random_events_enabled,
            random_event_chance,
            god_mode_enabled: helper.god_mode_enabled,
            ai_provider: helper.ai_provider,
            ollama_base_url: helper.ollama_base_url,
            ollama_model: helper.ollama_model,
            openai_base_url: helper.openai_base_url,
            openai_api_key: helper.openai_api_key,
            openai_model: helper.openai_model,
            grok_base_url: helper.grok_base_url,
            grok_api_key: helper.grok_api_key,
            grok_model: helper.grok_model,
            claude_base_url: helper.claude_base_url,
            claude_api_key: helper.claude_api_key,
            claude_model: helper.claude_model,
            meeting_turns_per_agent: helper.meeting_turns_per_agent,
            meeting_llm_fallback: helper.meeting_llm_fallback,
            pure_local_mode: helper.pure_local_mode,
            pixel_filter_enabled: helper.pixel_filter_enabled,
            crt_filter_enabled: helper.crt_filter_enabled,
            low_power_mode: helper.low_power_mode,
            backup_interval_minutes: helper.backup_interval_minutes,
            music_enabled: helper.music_enabled,
            music_volume: helper.music_volume.clamp(0.0, 1.0),
            sfx_enabled: helper.sfx_enabled,
            sfx_volume: helper.sfx_volume.clamp(0.0, 1.0),
            scrum_auto_schedule: helper.scrum_auto_schedule,
            scrum_auto_execute: helper.scrum_auto_execute,
            scrum_execution_paused: helper.scrum_execution_paused,
            scrum_min_tokens_guard: helper.scrum_min_tokens_guard,
            scrum_max_executions_per_tick: helper.scrum_max_executions_per_tick.max(1),
            scrum_worker_enabled: helper.scrum_worker_enabled,
            scrum_worker_interval_secs: helper.scrum_worker_interval_secs.max(5),
            scrum_auto_route: helper.scrum_auto_route,
            scrum_auto_approve: helper.scrum_auto_approve,
            scrum_parallel_agents: helper.scrum_parallel_agents,
            scrum_auto_retry_blocked: helper.scrum_auto_retry_blocked,
            scrum_max_blocked_retries: helper.scrum_max_blocked_retries.max(1),
            scrum_use_agent_tools: helper.scrum_use_agent_tools,
        })
    }
}

fn default_ai_provider() -> String {
    "mock".to_string()
}

fn default_backup_interval() -> u32 {
    30
}

impl Default for GameSettings {
    fn default() -> Self {
        Self {
            play_mode: if crate::config::is_v1() {
                PlayMode::Work
            } else {
                PlayMode::Game
            },
            random_events_enabled: !crate::config::is_v1(),
            random_event_chance: default_random_event_chance(),
            god_mode_enabled: false,
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
            crt_filter_enabled: false,
            low_power_mode: false,
            backup_interval_minutes: 30,
            music_enabled: true,
            music_volume: default_music_volume(),
            sfx_enabled: true,
            sfx_volume: default_sfx_volume(),
            scrum_auto_schedule: true,
            scrum_auto_execute: true,
            scrum_execution_paused: false,
            scrum_min_tokens_guard: 0,
            scrum_max_executions_per_tick: 1,
            scrum_worker_enabled: true,
            scrum_worker_interval_secs: 30,
            scrum_auto_route: true,
            scrum_auto_approve: true,
            scrum_parallel_agents: false,
            scrum_auto_retry_blocked: true,
            scrum_max_blocked_retries: 2,
            scrum_use_agent_tools: false,
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
    #[serde(default)]
    pub cached_open_gigs: Vec<crate::hub::HubGig>,
    #[serde(default)]
    pub cached_hub_soul_listings: Vec<serde_json::Value>,
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
            cached_open_gigs: Vec::new(),
            cached_hub_soul_listings: Vec::new(),
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
    #[serde(default)]
    pub ai_provider: Option<String>,
    #[serde(default)]
    pub agent_kind: Option<String>,
    #[serde(default)]
    pub skills: Vec<String>,
    #[serde(default)]
    pub reports_to: Option<String>,
    #[serde(default)]
    pub manages_department: Option<String>,
}

pub fn skills_for_role(role: &str) -> Vec<String> {
    let lower = role.to_lowercase();
    if lower.contains("dev") || lower.contains("engineer") {
        return vec!["Coding".to_string(), "AI".to_string()];
    }
    if lower.contains("design") {
        return vec!["Design".to_string(), "UI".to_string()];
    }
    if lower.contains("ceo") || lower.contains("coo") || lower.contains("executive") {
        return vec!["Leadership".to_string(), "Strategy".to_string()];
    }
    if lower.contains("hr") || lower.contains("recruit") {
        return vec!["People".to_string(), "Culture".to_string()];
    }
    if lower.contains("fate") || lower.contains("chance") {
        return vec!["Random Events".to_string(), "Narrative".to_string()];
    }
    vec!["Collaboration".to_string()]
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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DepartmentTokenWallet {
    pub balance: u64,
    pub allocated: u64,
    /// Lifetime tokens consumed (never resets).
    pub spent: u64,
    /// Max tokens allowed per budget period (0 = unlimited).
    #[serde(default)]
    pub period_limit: u64,
    /// weekly | monthly | quarterly | yearly | custom | none
    #[serde(default = "default_token_budget_period_type")]
    pub period_type: String,
    /// Custom period length in days when period_type is "custom".
    #[serde(default = "default_token_budget_period_days")]
    pub period_days: u32,
    /// Tokens consumed in the current budget period.
    #[serde(default)]
    pub period_spent: u64,
    /// ISO timestamp when the current budget period started.
    #[serde(default)]
    pub period_started_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentTokenWallet {
    pub balance: u64,
    pub allocated: u64,
    /// Lifetime tokens consumed (never resets).
    pub spent: u64,
    #[serde(default)]
    pub period_limit: u64,
    #[serde(default = "default_token_budget_period_type")]
    pub period_type: String,
    #[serde(default = "default_token_budget_period_days")]
    pub period_days: u32,
    #[serde(default)]
    pub period_spent: u64,
    #[serde(default)]
    pub period_started_at: Option<String>,
}

fn default_token_budget_period_type() -> String {
    "none".to_string()
}

fn default_token_budget_period_days() -> u32 {
    30
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsageEntry {
    pub id: String,
    pub at: String,
    pub source: String,
    pub provider: String,
    pub agent_id: Option<String>,
    pub department: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub usage_source: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TokenEconomy {
    pub company_balance: u64,
    pub monthly_burn_tokens: u64,
    pub monthly_inflow_tokens: u64,
    #[serde(default)]
    pub allocations: BudgetAllocations,
    #[serde(default)]
    pub departments: HashMap<String, DepartmentTokenWallet>,
    #[serde(default)]
    pub agents: HashMap<String, AgentTokenWallet>,
    #[serde(default)]
    pub company_starved: bool,
}

impl Default for TokenEconomy {
    fn default() -> Self {
        Self {
            company_balance: 15_000,
            monthly_burn_tokens: 1200,
            monthly_inflow_tokens: 1800,
            allocations: BudgetAllocations::default(),
            departments: HashMap::new(),
            agents: HashMap::new(),
            company_starved: false,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
struct TokenEconomyRaw {
    company_balance: u64,
    monthly_burn_tokens: u64,
    monthly_inflow_tokens: u64,
    #[serde(default)]
    allocations: BudgetAllocations,
    #[serde(default)]
    departments: HashMap<String, DepartmentTokenWallet>,
    #[serde(default)]
    agents: HashMap<String, AgentTokenWallet>,
    #[serde(default)]
    company_starved: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct LegacyFinanceState {
    cash_balance: f64,
    compute_tokens: f64,
    monthly_burn: f64,
    monthly_revenue: f64,
    #[serde(default)]
    allocations: BudgetAllocations,
    #[serde(default)]
    compute_starved: bool,
    #[serde(default)]
    cash_crisis: bool,
}

impl<'de> Deserialize<'de> for TokenEconomy {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer)?;
        if value.get("company_balance").is_some() {
            let raw: TokenEconomyRaw =
                serde_json::from_value(value).map_err(serde::de::Error::custom)?;
            return Ok(TokenEconomy {
                company_balance: raw.company_balance,
                monthly_burn_tokens: raw.monthly_burn_tokens,
                monthly_inflow_tokens: raw.monthly_inflow_tokens,
                allocations: raw.allocations,
                departments: raw.departments,
                agents: raw.agents,
                company_starved: raw.company_starved,
            });
        }
        let legacy: LegacyFinanceState =
            serde_json::from_value(value).map_err(serde::de::Error::custom)?;
        Ok(TokenEconomy {
            company_balance: (legacy.cash_balance + legacy.compute_tokens).round().max(0.0) as u64,
            monthly_burn_tokens: legacy.monthly_burn.round().max(0.0) as u64,
            monthly_inflow_tokens: legacy.monthly_revenue.round().max(0.0) as u64,
            allocations: legacy.allocations,
            departments: HashMap::new(),
            agents: HashMap::new(),
            company_starved: legacy.compute_starved || legacy.cash_crisis,
        })
    }
}

/// Legacy alias kept for gradual migration in command signatures.
pub type FinanceState = TokenEconomy;

fn default_cycle_days() -> u32 {
    14
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InternalProject {
    pub id: String,
    pub title: String,
    pub progress: f32,
    pub priority: u8,
    #[serde(default)]
    pub owner_department: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub pm_agent_id: Option<String>,
    #[serde(default)]
    pub active_sprint_id: Option<String>,
    #[serde(default = "default_cycle_days")]
    pub default_cycle_days: u32,
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
    #[serde(default)]
    pub narrator: Option<String>,
    #[serde(default)]
    pub generated_by_ai: bool,
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
    pub company_id: String,
    #[serde(default)]
    pub company_name: String,
    #[serde(default)]
    pub company_industry: String,
    #[serde(default)]
    pub company_tagline: String,
    #[serde(default)]
    pub company_created_at: Option<String>,
    #[serde(default = "default_onboarding_completed")]
    pub onboarding_completed: bool,
    pub settings: GameSettings,
    #[serde(rename = "token_economy", alias = "finance")]
    pub token_economy: TokenEconomy,
    #[serde(default)]
    pub token_ledger: Vec<TokenUsageEntry>,
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
    pub department_ai_providers: HashMap<String, String>,
    #[serde(default)]
    pub co_ceo: CoCeoState,
    #[serde(default)]
    pub projects: Vec<InternalProject>,
    #[serde(default)]
    pub work_nodes: Vec<crate::scrum::WorkNode>,
    #[serde(default)]
    pub sprints: Vec<crate::scrum::Sprint>,
    #[serde(default)]
    pub directives: Vec<crate::scrum::Directive>,
    #[serde(default)]
    pub execution_runs: Vec<crate::scrum::ExecutionRun>,
    #[serde(default)]
    pub default_pm_agent_id: Option<String>,
    pub day_number: u32,
    pub tick: u64,
    pub last_backup_tick: u64,
    #[serde(default)]
    pub last_deploy_url: Option<String>,
    #[serde(default)]
    pub last_deploy_at: Option<String>,
    #[serde(default)]
    pub last_deploy_provider: Option<String>,
    #[serde(default)]
    pub visual_design: visual_design::CompanyVisualDesign,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            company_id: String::new(),
            company_name: String::new(),
            company_industry: String::new(),
            company_tagline: String::new(),
            company_created_at: None,
            onboarding_completed: false,
            settings: GameSettings::default(),
            token_economy: TokenEconomy::default(),
            token_ledger: Vec::new(),
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
            department_ai_providers: HashMap::new(),
            co_ceo: CoCeoState::default(),
            projects: Vec::new(),
            work_nodes: Vec::new(),
            sprints: Vec::new(),
            directives: Vec::new(),
            execution_runs: Vec::new(),
            default_pm_agent_id: None,
            day_number: 1,
            tick: 0,
            last_backup_tick: 0,
            last_deploy_url: None,
            last_deploy_at: None,
            last_deploy_provider: None,
            visual_design: visual_design::CompanyVisualDesign::default(),
        }
    }
}

impl AppState {
    pub fn seed_defaults(&mut self) {
        if !self.agents.is_empty() {
            return;
        }
        let _ = self.apply_agent_roster(&default_agent_roster());
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
                description: "Core AI company platform features.".into(),
                pm_agent_id: None,
                active_sprint_id: None,
                default_cycle_days: 14,
            },
            InternalProject {
                id: "proj-hr".into(),
                title: "Team Culture Program".into(),
                progress: 0.2,
                priority: 2,
                owner_department: "Human Resources".into(),
                description: "Morale, rituals, and team health.".into(),
                pm_agent_id: None,
                active_sprint_id: None,
                default_cycle_days: 14,
            },
        ];
        self.seed_scrum_demo();
    }

    pub fn seed_scrum_demo(&mut self) {
        if !self.work_nodes.is_empty() {
            return;
        }
        let now = crate::scrum::now_iso();
        let story_id = crate::scrum::new_node_id();
        self.work_nodes.push(crate::scrum::WorkNode {
            id: story_id.clone(),
            parent_id: None,
            project_id: "proj-core".into(),
            kind: crate::scrum::WorkNodeKind::Story,
            title: "Ship Projects command center".into(),
            description: "Backlog, sprint board, and agent inbox.".into(),
            status: crate::scrum::WorkNodeStatus::Ready,
            priority: 4,
            story_points: 5,
            backlog_rank: 1,
            assignee_agent_id: None,
            assigned_by_manager_id: None,
            owner_pm_agent_id: self.default_pm_agent_id.clone(),
            retry_count: 0,
            department: "Engineering".into(),
            sprint_id: None,
            depends_on: Vec::new(),
            acceptance_criteria: vec!["Projects panel live in navigation.".into()],
            linked_workspace_page_id: None,
            linked_gig_contract_id: None,
            created_at: now.clone(),
            updated_at: now.clone(),
            completed_at: None,
        });
        for (index, (title, points)) in [
            ("API & data model", 2u8),
            ("Projects UI shell", 2u8),
            ("Agent inbox wiring", 1u8),
        ]
        .iter()
        .enumerate()
        {
            self.work_nodes.push(crate::scrum::WorkNode {
                id: crate::scrum::new_node_id(),
                parent_id: Some(story_id.clone()),
                project_id: "proj-core".into(),
                kind: crate::scrum::WorkNodeKind::Task,
                title: title.to_string(),
                description: String::new(),
                status: crate::scrum::WorkNodeStatus::Backlog,
                priority: 4,
                story_points: *points,
                backlog_rank: index as u32,
                assignee_agent_id: None,
                assigned_by_manager_id: None,
                owner_pm_agent_id: self.default_pm_agent_id.clone(),
                retry_count: 0,
                department: "Engineering".into(),
                sprint_id: None,
                depends_on: Vec::new(),
                acceptance_criteria: vec!["Deliverable in Workspace.".into()],
                linked_workspace_page_id: None,
                linked_gig_contract_id: None,
                created_at: now.clone(),
                updated_at: now.clone(),
                completed_at: None,
            });
        }
    }
}

#[cfg(test)]
mod settings_tests {
    use super::*;

    #[test]
    fn migrates_legacy_fun_mode() {
        let raw = serde_json::json!({
            "random_events_enabled": true,
            "event_mode": "fun",
            "god_mode_enabled": false,
            "ai_provider": "mock",
            "pure_local_mode": false,
            "pixel_filter_enabled": false,
            "low_power_mode": false,
            "backup_interval_minutes": 30
        });
        let settings: GameSettings = serde_json::from_value(raw).expect("settings");
        assert_eq!(settings.play_mode, PlayMode::Game);
        assert!((settings.random_event_chance - 0.18).abs() < f32::EPSILON);
    }

    #[test]
    fn migrates_legacy_serious_mode_to_work() {
        let raw = serde_json::json!({
            "random_events_enabled": true,
            "event_mode": "serious",
            "god_mode_enabled": false,
            "ai_provider": "mock",
            "pure_local_mode": false,
            "pixel_filter_enabled": false,
            "low_power_mode": false,
            "backup_interval_minutes": 30
        });
        let settings: GameSettings = serde_json::from_value(raw).expect("settings");
        assert_eq!(settings.play_mode, PlayMode::Work);
        assert!(!settings.random_events_enabled);
    }
}
