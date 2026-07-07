use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanySummary {
    pub id: String,
    pub name: String,
    pub industry: String,
    pub tagline: String,
    pub created_at: String,
    pub day_number: u32,
    pub agent_count: u32,
    pub onboarding_completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CompanyRegistry {
    pub active_company_id: Option<String>,
    pub companies: Vec<CompanySummary>,
}

impl CompanyRegistry {
    pub fn upsert_summary(&mut self, summary: CompanySummary) {
        if let Some(existing) = self
            .companies
            .iter_mut()
            .find(|company| company.id == summary.id)
        {
            *existing = summary;
        } else {
            self.companies.push(summary);
        }
    }

    pub fn remove_company(&mut self, company_id: &str) -> bool {
        let before = self.companies.len();
        self.companies.retain(|company| company.id != company_id);
        self.companies.len() < before
    }
}

pub fn summary_from_state(state: &AppState) -> CompanySummary {
    CompanySummary {
        id: state.company_id.clone(),
        name: state.company_name.clone(),
        industry: state.company_industry.clone(),
        tagline: state.company_tagline.clone(),
        created_at: state
            .company_created_at
            .clone()
            .unwrap_or_else(|| Utc::now().to_rfc3339()),
        day_number: state.day_number,
        agent_count: state.agents.len() as u32,
        onboarding_completed: state.onboarding_completed,
    }
}

pub fn fresh_company_state(
    name: &str,
    industry: &str,
    tagline: &str,
    play_mode: super::PlayMode,
    pure_local_mode: bool,
    random_events_enabled: bool,
    random_event_chance: f32,
) -> AppState {
    let company_id = Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    let mut state = AppState {
        company_id,
        company_name: name.to_string(),
        company_industry: industry.to_string(),
        company_tagline: tagline.to_string(),
        company_created_at: Some(created_at),
        onboarding_completed: false,
        settings: super::GameSettings {
            play_mode,
            pure_local_mode,
            random_events_enabled,
            random_event_chance,
            ..Default::default()
        },
        ..Default::default()
    };
    if pure_local_mode {
        state.settings.ai_provider = "mock".to_string();
        state.hub.connected = false;
    }
    crate::fate::sync_play_mode_side_effects(&mut state);
    state
}