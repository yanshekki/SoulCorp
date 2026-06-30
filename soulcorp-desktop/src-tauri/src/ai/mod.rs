pub mod hub_chat;
pub mod mock;
pub mod ollama;
pub mod provider;

use hub_chat::HubChatProvider;
use mock::MockProvider;
use ollama::OllamaProvider;
use provider::{AiProvider, ChatRequest, ChatResponse};
use std::sync::Arc;

use crate::state::{GameSettings, HubState};

pub fn provider_for(settings: &GameSettings, hub: &HubState) -> Arc<dyn AiProvider> {
    match settings.ai_provider.as_str() {
        "ollama" => Arc::new(OllamaProvider::default()),
        "soulmd-hub" | "soulmd_hub" | "hub" => Arc::new(HubChatProvider::new(
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
