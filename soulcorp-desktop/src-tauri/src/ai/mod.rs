pub mod health;
pub mod hub_chat;
pub mod mock;
pub mod ollama;
pub mod openai_compatible;
pub mod provider;
pub mod selection;
pub mod token_estimate;

pub use health::{probe_agent_ai, probe_meeting_ai, MeetingAiStatus};
pub use selection::{normalize_agent_ai_provider, normalize_ai_provider_override};

use hub_chat::HubChatProvider;
use mock::MockProvider;
use ollama::OllamaProvider;
use openai_compatible::OpenAiCompatibleProvider;
use provider::{AiProvider, ChatRequest, ChatResponse, TokenUsageSource};
use std::sync::Arc;

use crate::state::{AppState, GameSettings, HubState};
use crate::token_budget::{can_afford, charge_tokens, ChargeContext};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct BilledChatRequest {
    pub request: ChatRequest,
    pub agent_id: String,
    pub department: String,
    pub source: String,
}

pub fn chat_with_fallback_billed(
    state: &mut AppState,
    billed: BilledChatRequest,
    department_providers: &HashMap<String, String>,
    agent_override: Option<&str>,
) -> Result<ChatResponse, String> {
    let settings = state.settings.clone();
    let hub = state.hub.clone();
    let skip_billing = settings.pure_local_mode;

    let status = probe_agent_ai(
        &settings,
        &hub,
        department_providers,
        &billed.department,
        agent_override,
    );

    if !skip_billing && status.active_provider != "mock" {
        let estimate = token_estimate::estimate_request(&billed.request);
        can_afford(state, &billed.agent_id, estimate)?;
    }

    let provider = provider_for_active(&status, &settings, &hub);
    let response = match provider.chat(billed.request.clone()) {
        Ok(response) => response,
        Err(error) if settings.meeting_llm_fallback && status.active_provider != "mock" => {
            eprintln!(
                "LLM provider '{}' failed, using mock fallback: {error}",
                status.active_provider
            );
            let fallback = MockProvider;
            let mut response = fallback.chat(billed.request)?;
            response.provider = format!("mock-fallback ({})", status.active_provider);
            response
        }
        Err(error) => return Err(error),
    };

    if !skip_billing && response.usage.source != TokenUsageSource::Zero {
        charge_tokens(
            state,
            ChargeContext {
                source: billed.source,
                agent_id: billed.agent_id,
                department: billed.department,
                provider: response.provider.clone(),
                prompt_tokens: response.usage.prompt_tokens,
                completion_tokens: response.usage.completion_tokens,
                total_tokens: response.usage.total_tokens,
                usage_source: response.usage.source,
            },
        )?;
    }

    Ok(response)
}

/// LLM call without holding `AppState` — billing is returned for the caller to apply.
pub fn chat_detached(
    settings: &GameSettings,
    hub: &HubState,
    department_providers: &HashMap<String, String>,
    billed: BilledChatRequest,
    agent_override: Option<&str>,
) -> Result<(ChatResponse, Option<ChargeContext>), String> {
    let skip_billing = settings.pure_local_mode;
    let status = probe_agent_ai(
        settings,
        hub,
        department_providers,
        &billed.department,
        agent_override,
    );

    let provider = provider_for_active(&status, settings, hub);
    let response = match provider.chat(billed.request.clone()) {
        Ok(response) => response,
        Err(error) if settings.meeting_llm_fallback && status.active_provider != "mock" => {
            eprintln!(
                "LLM provider '{}' failed, using mock fallback: {error}",
                status.active_provider
            );
            let fallback = MockProvider;
            let mut response = fallback.chat(billed.request)?;
            response.provider = format!("mock-fallback ({})", status.active_provider);
            response
        }
        Err(error) => return Err(error),
    };

    let charge = if skip_billing || response.usage.source == TokenUsageSource::Zero {
        None
    } else {
        Some(ChargeContext {
            source: billed.source,
            agent_id: billed.agent_id,
            department: billed.department,
            provider: response.provider.clone(),
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
            usage_source: response.usage.source,
        })
    };

    Ok((response, charge))
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
        "openai" => Arc::new(OpenAiCompatibleProvider::new(
            settings.openai_base_url.clone(),
            settings.openai_api_key.clone(),
            settings.openai_model.clone(),
            "openai".to_string(),
        )),
        "grok" => Arc::new(OpenAiCompatibleProvider::new(
            settings.grok_base_url.clone(),
            settings.grok_api_key.clone(),
            settings.grok_model.clone(),
            "grok".to_string(),
        )),
        "claude" => Arc::new(OpenAiCompatibleProvider::new(
            settings.claude_base_url.clone(),
            settings.claude_api_key.clone(),
            settings.claude_model.clone(),
            "claude".to_string(),
        )),
        "soulmd-hub" => Arc::new(HubChatProvider::new(
            hub.base_url.clone(),
            hub.api_key.clone(),
        )),
        _ => Arc::new(MockProvider),
    }
}