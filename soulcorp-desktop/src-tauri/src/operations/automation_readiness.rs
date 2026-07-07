use crate::state::AppState;
use crate::token_budget::total_company_tokens;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationReadinessItem {
    pub id: String,
    pub label: String,
    pub ok: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationReadiness {
    pub items: Vec<AutomationReadinessItem>,
    pub ready: bool,
}

pub fn compute_automation_readiness(state: &AppState) -> AutomationReadiness {
    let has_company = !state.company_id.is_empty();
    let has_project = !state.projects.is_empty();
    let staffed_agents = state
        .agents
        .values()
        .filter(|a| !crate::fate::is_system_agent(a))
        .count();
    let llm_configured = state.settings.pure_local_mode
        || (state.settings.ai_provider != "mock"
            && (!state.settings.openai_api_key.is_empty()
                || !state.settings.grok_api_key.is_empty()
                || !state.settings.claude_api_key.is_empty()
                || state.settings.ai_provider == "ollama"));
    let worker_on = state.settings.scrum_worker_enabled && !state.settings.scrum_execution_paused;
    let orchestrator_on = state.settings.orchestrator_enabled;
    let token_pool = total_company_tokens(&state.token_economy);
    let tokens_ok = token_pool >= state.settings.scrum_min_tokens_guard;

    let items = vec![
        AutomationReadinessItem {
            id: "company".into(),
            label: "Company profile".into(),
            ok: has_company && state.onboarding_completed,
            detail: if has_company {
                "Onboarding complete.".into()
            } else {
                "Finish first-launch setup.".into()
            },
        },
        AutomationReadinessItem {
            id: "project".into(),
            label: "Active project".into(),
            ok: has_project,
            detail: if has_project {
                format!("{} project(s) on the board.", state.projects.len())
            } else {
                "Create at least one project so directives can route.".into()
            },
        },
        AutomationReadinessItem {
            id: "agents".into(),
            label: "Agent roster".into(),
            ok: staffed_agents >= 1,
            detail: format!("{staffed_agents} staffed agent(s)."),
        },
        AutomationReadinessItem {
            id: "llm".into(),
            label: "AI provider".into(),
            ok: llm_configured,
            detail: if state.settings.pure_local_mode {
                "Pure local mode — mock dialogue.".into()
            } else if llm_configured {
                format!("Using {}.", state.settings.ai_provider)
            } else {
                "Configure Ollama or an API key in Settings, or enable Pure Local Mode.".into()
            },
        },
        AutomationReadinessItem {
            id: "worker".into(),
            label: "Background worker".into(),
            ok: worker_on,
            detail: if worker_on {
                format!(
                    "Tick every {}s.",
                    state.settings.scrum_worker_interval_secs.max(5)
                )
            } else if !state.settings.scrum_worker_enabled {
                "Enable scrum worker in Policies.".into()
            } else {
                "Execution is paused — resume in Policies.".into()
            },
        },
        AutomationReadinessItem {
            id: "orchestrator".into(),
            label: "Orchestrator".into(),
            ok: orchestrator_on,
            detail: if orchestrator_on {
                "Auto briefings and directives enabled.".into()
            } else {
                "Enable orchestrator in Policies.".into()
            },
        },
        AutomationReadinessItem {
            id: "tokens".into(),
            label: "Token pool".into(),
            ok: tokens_ok,
            detail: if tokens_ok {
                format!("{token_pool} tokens (guard: {}).", state.settings.scrum_min_tokens_guard)
            } else {
                format!(
                    "Pool {token_pool} is below guard {} — auto-execution will skip.",
                    state.settings.scrum_min_tokens_guard
                )
            },
        },
    ];

    let ready = items.iter().take(6).all(|item| item.ok) && tokens_ok;

    AutomationReadiness { items, ready }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppState;

    #[test]
    fn readiness_requires_project_and_worker() {
        let mut state = AppState::default();
        state.company_id = "co-1".into();
        state.onboarding_completed = true;
        let report = compute_automation_readiness(&state);
        assert!(!report.ready);
        assert!(report.items.iter().any(|i| i.id == "project" && !i.ok));

        state.seed_projects();
        state.settings.scrum_worker_enabled = true;
        state.settings.orchestrator_enabled = true;
        let report = compute_automation_readiness(&state);
        assert!(report.items.iter().find(|i| i.id == "project").unwrap().ok);
    }
}