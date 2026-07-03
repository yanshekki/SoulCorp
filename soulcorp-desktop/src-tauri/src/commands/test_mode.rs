use crate::achievements::{default_achievements, default_endings};
use crate::config;
use crate::db::persistence::{clear_all_persisted_data, commit};
use crate::relationships;
use crate::state::{default_agent_roster, fresh_company_state};
use crate::state::visual_design::CompanyVisualDesign;
use crate::state::{AppState, GameEvent, GigContract, PlayMode};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestModeResult {
    pub message: String,
    pub company_name: Option<String>,
    pub company_id: Option<String>,
}

fn warm_startup_design() -> CompanyVisualDesign {
    crate::commands::visual_design::preset_for("warm-startup")
}

fn build_fake_company_state() -> AppState {
    let mut state = fresh_company_state(
        "Nova Dynamics",
        "AI SaaS",
        "Building agent-native companies at lightspeed",
        PlayMode::Game,
        false,
        true,
        0.18,
    );
    state.onboarding_completed = true;
    state
        .apply_agent_roster(&default_agent_roster())
        .expect("seed fake roster");
    state.day_number = 87;
    state.tick = 2400;
    state.token_economy.company_balance = 48_200;
    state.token_economy.monthly_burn_tokens = 4_200;
    state.token_economy.monthly_inflow_tokens = 6_100;
    state.token_economy.company_starved = false;
    crate::token_budget::initialize_wallets_from_agents(&mut state);
    state.stats.meetings_completed = 12;
    state.stats.events_triggered = 8;
    state.stats.pages_created = 6;
    state.stats.gigs_completed = 2;
    state.achievements = default_achievements();
    state.endings = default_endings();
    state.visual_design = warm_startup_design();
    relationships::seed_default_relationships(&mut state);

    state.events = vec![
        GameEvent {
            id: "evt-test-1".into(),
            title: "Breakthrough Idea".into(),
            description: "Mira shipped a new automation pipeline ahead of schedule.".into(),
            tone: "positive".into(),
            morale_delta: 0.08,
            cash_delta: 1200.0,
            narrator: Some("Fate".into()),
            generated_by_ai: true,
        },
        GameEvent {
            id: "evt-test-2".into(),
            title: "Marketplace Win".into(),
            description: "A client gig cleared QC with a 94% score.".into(),
            tone: "positive".into(),
            morale_delta: 0.05,
            cash_delta: 2800.0,
            narrator: None,
            generated_by_ai: false,
        },
        GameEvent {
            id: "evt-test-3".into(),
            title: "Burnout Warning".into(),
            description: "Kai flagged morale risk after three late-night launches.".into(),
            tone: "negative".into(),
            morale_delta: -0.04,
            cash_delta: -400.0,
            narrator: Some("Fate".into()),
            generated_by_ai: true,
        },
    ];

    let now = Utc::now().to_rfc3339();
    state.gig_contracts.push(GigContract {
        contract_id: "contract-test-1".into(),
        gig_id: 9001,
        title: "Agent onboarding SOUL.md pack".into(),
        description: "Deliver polished onboarding docs for a fintech client.".into(),
        budget_usdt: 3200.0,
        required_skills: vec!["writing".into(), "hr".into()],
        status: "in_progress".into(),
        progress: 0.62,
        payout_usdt: 2880.0,
        platform_fee_usdt: 320.0,
        accepted_at: now.clone(),
        started_at: Some(now.clone()),
        submitted_at: None,
        completed_at: None,
        qc_score: None,
        qc_notes: None,
    });

    state
}

#[tauri::command]
pub fn clear_all_test_data(
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<TestModeResult, String> {
    clear_all_persisted_data(&app)?;
    *app_state.lock().map_err(|e| e.to_string())? = AppState::default();

    Ok(TestModeResult {
        message: "All local SoulCorp data cleared. Restart onboarding from a blank slate.".into(),
        company_name: None,
        company_id: None,
    })
}

#[tauri::command]
pub fn seed_fake_test_data(
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<TestModeResult, String> {
    if config::is_v1() {
        return Err(
            "Fake test seed is only available in SoulCorp Simulator (v2) dev builds.".into(),
        );
    }
    let state = build_fake_company_state();
    let company_id = state.company_id.clone();
    let company_name = state.company_name.clone();

    commit(app, &state)?;

    *app_state.lock().map_err(|e| e.to_string())? = state;

    Ok(TestModeResult {
        message: format!(
            "Seeded demo company \"{company_name}\" with agents, finance, events, and a marketplace gig."
        ),
        company_name: Some(company_name),
        company_id: Some(company_id),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fake_state_is_onboarded_with_agents() {
        let state = build_fake_company_state();
        assert!(state.onboarding_completed);
        let expected_agents = if config::is_v2() { 4 } else { 3 };
        assert_eq!(state.agents.len(), expected_agents);
        if config::is_v2() {
            assert!(state.agents.contains_key("agent-fate"));
        }
        assert_eq!(state.day_number, 87);
        assert!(!state.events.is_empty());
        for agent in state.agents.values() {
            if agent.agent_kind.as_deref() == Some("fate") {
                continue;
            }
            assert!(agent.soul.is_some(), "starter agent {} needs soul", agent.id);
        }
    }
}