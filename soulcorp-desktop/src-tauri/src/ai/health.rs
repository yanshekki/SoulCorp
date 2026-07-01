use super::hub_chat::HubChatProvider;
use super::ollama::OllamaProvider;
use super::selection::{effective_provider_for_agent, provider_label};
use crate::state::{GameSettings, HubState};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingAiStatus {
    pub configured_provider: String,
    pub active_provider: String,
    pub ollama_reachable: bool,
    pub hub_configured: bool,
    pub hub_reachable: bool,
    pub ollama_model: String,
    pub ollama_base_url: String,
    pub meeting_turns_per_agent: u32,
    pub fallback_enabled: bool,
    pub message: String,
}

pub fn probe_meeting_ai(settings: &GameSettings, hub: &HubState) -> MeetingAiStatus {
    probe_agent_ai(settings, hub, &HashMap::new(), "", None)
}

pub fn probe_agent_ai(
    settings: &GameSettings,
    hub: &HubState,
    department_providers: &HashMap<String, String>,
    department: &str,
    agent_provider_override: Option<&str>,
) -> MeetingAiStatus {
    let configured_provider = effective_provider_for_agent(
        settings,
        department_providers,
        department,
        agent_provider_override,
    );
    let ollama = OllamaProvider::new(settings.ollama_base_url.clone(), settings.ollama_model.clone());
    let ollama_reachable = ollama.is_reachable();

    let hub_configured = hub
        .api_key
        .as_ref()
        .map(|key| !key.trim().is_empty())
        .unwrap_or(false);
    let hub_reachable = if hub_configured {
        HubChatProvider::new(hub.base_url.clone(), hub.api_key.clone()).is_reachable()
    } else {
        false
    };

    let active_provider = resolve_active_provider(
        &configured_provider,
        settings,
        ollama_reachable,
        hub_configured,
        hub_reachable,
    );

    let message = status_message(
        &active_provider,
        settings,
        department,
        agent_provider_override,
        ollama_reachable,
        hub_reachable,
    );

    MeetingAiStatus {
        configured_provider,
        active_provider,
        ollama_reachable,
        hub_configured,
        hub_reachable,
        ollama_model: settings.ollama_model.clone(),
        ollama_base_url: settings.ollama_base_url.clone(),
        meeting_turns_per_agent: settings.meeting_turns_per_agent,
        fallback_enabled: settings.meeting_llm_fallback,
        message,
    }
}

fn status_message(
    active_provider: &str,
    settings: &GameSettings,
    department: &str,
    agent_provider_override: Option<&str>,
    ollama_reachable: bool,
    hub_reachable: bool,
) -> String {
    let scope = if agent_provider_override.is_some() {
        "This agent"
    } else if !department.is_empty() {
        &format!("{department} department")
    } else {
        "Meetings"
    };

    match active_provider {
        "ollama" => format!(
            "{scope} will use Ollama ({}) at {}.",
            settings.ollama_model, settings.ollama_base_url
        ),
        "openai" => format!(
            "{scope} will use OpenAI-compatible API ({}) at {}.",
            settings.openai_model, settings.openai_base_url
        ),
        "grok" => format!(
            "{scope} will use Grok API ({}) at {}.",
            settings.grok_model, settings.grok_base_url
        ),
        "claude" => format!(
            "{scope} will use Claude-compatible API ({}) at {}.",
            settings.claude_model, settings.claude_base_url
        ),
        "soulmd-hub" => format!("{scope} will use soulmd-hub chat API."),
        "mock" if settings.ai_provider == "ollama" && !ollama_reachable => {
            "Ollama is unreachable — dialogue will fall back to mock.".to_string()
        }
        "mock" if settings.ai_provider == "soulmd-hub" && !hub_reachable => {
            "soulmd-hub is not ready — dialogue will fall back to mock.".to_string()
        }
        "mock" if agent_provider_override.is_some() || !department.is_empty() => format!(
            "Configured provider is {} but runtime will use mock dialogue.",
            provider_label(active_provider)
        ),
        _ => format!("{scope} will use mock dialogue for offline play."),
    }
}

fn resolve_active_provider(
    configured_provider: &str,
    settings: &GameSettings,
    ollama_reachable: bool,
    hub_configured: bool,
    hub_reachable: bool,
) -> String {
    if settings.pure_local_mode {
        return "mock".to_string();
    }

    match configured_provider {
        "ollama" if ollama_reachable => "ollama".to_string(),
        "openai" if !settings.openai_api_key.trim().is_empty() => "openai".to_string(),
        "grok" if !settings.grok_api_key.trim().is_empty() => "grok".to_string(),
        "claude" if !settings.claude_api_key.trim().is_empty() => "claude".to_string(),
        "soulmd-hub" | "soulmd_hub" | "hub" if hub_configured && hub_reachable => {
            "soulmd-hub".to_string()
        }
        "soulmd-hub" | "soulmd_hub" | "hub" if hub_configured => "soulmd-hub".to_string(),
        "mock" => "mock".to_string(),
        _ if settings.meeting_llm_fallback => "mock".to_string(),
        other => other.to_string(),
    }
}