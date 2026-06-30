pub mod health;
pub mod hub_chat;
pub mod mock;
pub mod ollama;
pub mod provider;

pub use health::{probe_meeting_ai, MeetingAiStatus};

use hub_chat::HubChatProvider;
use mock::MockProvider;
use ollama::OllamaProvider;
use provider::{AiProvider, ChatRequest, ChatResponse};
use std::sync::Arc;

use crate::state::{GameSettings, HubState};

pub fn provider_for(settings: &GameSettings, hub: &HubState) -> Arc<dyn AiProvider> {
    match settings.ai_provider.as_str() {
        "ollama" => Arc::new(OllamaProvider::new(
            settings.ollama_base_url.clone(),
            settings.ollama_model.clone(),
        )),
        "soulmd-hub" | "soulmd_hub" | "hub" => Arc::new(HubChatProvider::new(
            hub.base_url.clone(),
            hub.api_key.clone(),
        )),
        _ => Arc::new(MockProvider),
    }
}

pub fn chat_with_fallback(
    settings: &GameSettings,
    hub: &HubState,
    request: ChatRequest,
) -> Result<ChatResponse, String> {
    let status = probe_meeting_ai(settings, hub);
    let provider = provider_for_active(&status, settings, hub);
    match provider.chat(request.clone()) {
        Ok(response) => Ok(response),
        Err(error) if settings.meeting_llm_fallback && status.active_provider != "mock" => {
            eprintln!("LLM provider '{}' failed, using mock fallback: {error}", status.active_provider);
            let fallback = MockProvider;
            let mut response = fallback.chat(request)?;
            response.provider = format!("mock-fallback ({})", status.active_provider);
            Ok(response)
        }
        Err(error) => Err(error),
    }
}

fn provider_for_active(
    status: &MeetingAiStatus,
    settings: &GameSettings,
    hub: &HubState,
) -> Arc<dyn AiProvider> {
    match status.active_provider.as_str() {
        "ollama" => Arc::new(OllamaProvider::new(
            settings.ollama_base_url.clone(),
            settings.ollama_model.clone(),
        )),
        "soulmd-hub" => Arc::new(HubChatProvider::new(
            hub.base_url.clone(),
            hub.api_key.clone(),
        )),
        _ => Arc::new(MockProvider),
    }
}

pub fn default_provider() -> Arc<dyn AiProvider> {
    Arc::new(MockProvider)
}

pub fn chat(provider: &dyn AiProvider, request: ChatRequest) -> Result<ChatResponse, String> {
    provider.chat(request)
}
