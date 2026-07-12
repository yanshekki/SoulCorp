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
    #[serde(default)]
    pub autopilot_phase: String,
    #[serde(default)]
    pub stall_reason: Option<String>,
}

pub fn compute_automation_readiness(state: &AppState) -> AutomationReadiness {
    let has_company = !state.company_id.is_empty();
    let has_project = !state.projects.is_empty();
    let staffed_agents = state
        .agents
        .values()
        .filter(|a| !crate::fate::is_system_agent(a))
        .count();
    // Must match ai::health::company_llm_credentials_ready (includes deepseek, hub, etc.).
    let llm_configured = crate::ai::health::company_llm_credentials_ready(&state.settings);
    let worker_on = state.settings.scrum_worker_enabled && !state.settings.scrum_execution_paused;
    let orchestrator_on = state.settings.orchestrator_enabled;
    let token_pool = total_company_tokens(&state.token_economy);
    let tokens_ok = token_pool >= state.settings.scrum_min_tokens_guard;
    let execution_runtime_ids: Vec<String> = state
        .agents
        .values()
        .filter(|agent| !crate::fate::is_system_agent(agent))
        .map(|agent| {
            crate::brain::resolve_execution_runtime(
                &state.settings,
                &state.department_agent_runtimes,
                &agent.department,
                agent,
            )
        })
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    let subprocess_runtime_ids: Vec<String> = execution_runtime_ids
        .iter()
        .filter(|runtime_id| crate::agent_runtime::is_subprocess_runtime(runtime_id))
        .cloned()
        .collect();
    let runtime_probes: Vec<_> = subprocess_runtime_ids
        .iter()
        .map(|runtime_id| {
            crate::agent_runtime::adapters::probe_runtime_for_id(runtime_id, &state.settings)
        })
        .collect();
    let runtime_ok = subprocess_runtime_ids.is_empty()
        || runtime_probes.iter().all(|probe| probe.binary_available);
    let runtime_detail = if subprocess_runtime_ids.is_empty() {
        "Using in-app LLM execution.".to_string()
    } else if runtime_probes.iter().all(|probe| probe.binary_available) {
        format!(
            "{} subprocess runtime(s) ready.",
            subprocess_runtime_ids.len()
        )
    } else {
        runtime_probes
            .iter()
            .find(|probe| !probe.binary_available)
            .map(|probe| probe.message.clone())
            .unwrap_or_else(|| "Subprocess runtime missing.".to_string())
    };

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
            id: "meeting_brain".into(),
            label: "Meeting brain".into(),
            ok: llm_configured,
            detail: if state.settings.pure_local_mode {
                "Pure local mode — mock dialogue.".into()
            } else if llm_configured {
                format!(
                    "Default {}.",
                    crate::brain::effective_meeting_label(
                        &state.settings,
                        &state.department_ai_providers,
                        "Executive",
                        None,
                    )
                )
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
        AutomationReadinessItem {
            id: "execution_runtime".into(),
            label: "Execution runtime".into(),
            ok: runtime_ok,
            detail: runtime_detail,
        },
    ];

    let ready = items.iter().take(7).all(|item| item.ok) && tokens_ok && runtime_ok;
    let phase = crate::autopilot::detect_phase(state);
    let stall_reason = if phase == crate::autopilot::AutopilotPhase::Stalled {
        Some(format!(
            "No progress for {} worker ticks.",
            state.autopilot.stall_tick_count
        ))
    } else {
        None
    };

    AutomationReadiness {
        items,
        ready,
        autopilot_phase: phase.as_str().to_string(),
        stall_reason,
    }
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

        state.projects.push(crate::state::InternalProject {
            id: "proj-1".into(),
            title: "User Project".into(),
            progress: 0.0,
            priority: 1,
            owner_department: "Engineering".into(),
            description: String::new(),
            pm_agent_id: None,
            active_sprint_id: None,
            default_cycle_days: 14,
        });
        state.settings.scrum_worker_enabled = true;
        state.settings.orchestrator_enabled = true;
        let report = compute_automation_readiness(&state);
        assert!(report.items.iter().find(|i| i.id == "project").unwrap().ok);
    }

    #[test]
    fn meeting_brain_recognizes_deepseek_api_key() {
        let mut state = AppState::default();
        state.settings.pure_local_mode = false;
        state.settings.ai_provider = "deepseek".into();
        state.settings.deepseek_api_key = "sk-test-deepseek-key".into();
        state.settings.openai_api_key.clear();
        state.settings.grok_api_key.clear();
        state.settings.claude_api_key.clear();
        let report = compute_automation_readiness(&state);
        let brain = report
            .items
            .iter()
            .find(|i| i.id == "meeting_brain")
            .expect("meeting_brain item");
        assert!(
            brain.ok,
            "DeepSeek key must satisfy Meeting brain readiness: {}",
            brain.detail
        );
    }
}