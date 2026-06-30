use super::hub_chat::HubChatProvider;
use super::ollama::OllamaProvider;
use crate::state::{GameSettings, HubState};
use serde::{Deserialize, Serialize};

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
        settings,
        ollama_reachable,
        hub_configured,
        hub_reachable,
    );

    let message = match active_provider.as_str() {
        "ollama" => format!(
            "Live meetings will use Ollama ({}) at {}.",
            settings.ollama_model, settings.ollama_base_url
        ),
        "openai" => format!(
            "Live meetings will use OpenAI-compatible API ({}) at {}.",
            settings.openai_model, settings.openai_base_url
        ),
        "grok" => format!(
            "Live meetings will use Grok API ({}) at {}.",
            settings.grok_model, settings.grok_base_url
        ),
        "claude" => format!(
            "Live meetings will use Claude-compatible API ({}) at {}.",
            settings.claude_model, settings.claude_base_url
        ),
        "soulmd-hub" => "Live meetings will use soulmd-hub chat API.".to_string(),
        "mock" if settings.ai_provider == "ollama" && !ollama_reachable => {
            "Ollama is unreachable — meetings will fall back to mock dialogue.".to_string()
        }
        "mock" if settings.ai_provider == "soulmd-hub" && !hub_reachable => {
            "soulmd-hub is not ready — meetings will fall back to mock dialogue.".to_string()
        }
        _ => "Meetings will use the mock provider for offline dialogue.".to_string(),
    };

    MeetingAiStatus {
        configured_provider: settings.ai_provider.clone(),
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

fn resolve_active_provider(
    settings: &GameSettings,
    ollama_reachable: bool,
    hub_configured: bool,
    hub_reachable: bool,
) -> String {
    match settings.ai_provider.as_str() {
        "ollama" if ollama_reachable => "ollama".to_string(),
        "openai" if !settings.openai_api_key.trim().is_empty() => "openai".to_string(),
        "grok" if !settings.grok_api_key.trim().is_empty() => "grok".to_string(),
        "claude" if !settings.claude_api_key.trim().is_empty() => "claude".to_string(),
        "soulmd-hub" | "soulmd_hub" | "hub" if hub_configured && hub_reachable => {
            "soulmd-hub".to_string()
        }
        "soulmd-hub" | "soulmd_hub" | "hub" if hub_configured => "soulmd-hub".to_string(),
        _ if settings.meeting_llm_fallback => "mock".to_string(),
        other => other.to_string(),
    }
}