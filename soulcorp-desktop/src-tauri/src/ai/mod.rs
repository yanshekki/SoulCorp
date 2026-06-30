pub mod mock;
pub mod provider;

use mock::MockProvider;
use provider::{AiProvider, ChatRequest, ChatResponse};
use std::sync::Arc;

pub fn default_provider() -> Arc<dyn AiProvider> {
    Arc::new(MockProvider)
}

pub fn chat(provider: &dyn AiProvider, request: ChatRequest) -> Result<ChatResponse, String> {
    provider.chat(request)
}
