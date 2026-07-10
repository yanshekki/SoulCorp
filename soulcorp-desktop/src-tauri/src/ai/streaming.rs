use super::health::{probe_agent_ai, MeetingAiStatus};
use super::mock::MockProvider;
use super::provider::{AiProvider, ChatRequest, ChatResponse, TokenUsage, TokenUsageSource};
use super::token_estimate;
use super::{BilledChatRequest, HubChatProvider};
use crate::agent_activity::emit_token_delta;
use crate::state::{AppState, GameSettings, HubState};
use crate::token_budget::{can_afford, charge_tokens, ChargeContext};
use reqwest::blocking::Client;
use serde_json::json;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::time::Duration;
use tauri::AppHandle;

pub struct StreamContext<'a> {
    pub state: &'a mut AppState,
    pub app: Option<&'a AppHandle>,
    pub session_id: &'a str,
    pub agent_id: &'a str,
    pub step: Option<&'a str>,
}

impl<'a> StreamContext<'a> {
    pub fn emit_delta(&mut self, delta: &str, reasoning: bool) {
        if self.state.settings.agent_activity_stream_enabled {
            emit_token_delta(
                self.state,
                self.app,
                self.session_id,
                self.agent_id,
                self.step,
                delta,
                reasoning,
            );
        }
    }
}

pub fn chat_stream_billed(
    ctx: &mut StreamContext<'_>,
    billed: BilledChatRequest,
    department_providers: &HashMap<String, String>,
    agent_override: Option<&str>,
) -> Result<ChatResponse, String> {
    if !ctx.state.settings.agent_activity_stream_enabled {
        return super::chat_with_fallback_billed(
            ctx.state,
            billed,
            department_providers,
            agent_override,
        );
    }

    let settings = ctx.state.settings.clone();
    let hub = ctx.state.hub.clone();
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
        can_afford(ctx.state, &billed.agent_id, estimate)?;
    }

    let result = stream_with_provider(ctx, &status, &settings, &hub, billed.request.clone());

    let response = match result {
        Ok(response) => response,
        Err(error) if settings.meeting_llm_fallback && status.active_provider != "mock" => {
            eprintln!(
                "Stream provider '{}' failed, using mock fallback: {error}",
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
            ctx.state,
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

fn stream_with_provider(
    ctx: &mut StreamContext<'_>,
    status: &MeetingAiStatus,
    settings: &GameSettings,
    hub: &HubState,
    request: ChatRequest,
) -> Result<ChatResponse, String> {
    match status.active_provider.as_str() {
        "ollama" => stream_ollama(ctx, settings, request, "ollama"),
        "openai" => stream_openai_compatible(
            ctx,
            settings.openai_base_url.clone(),
            settings.openai_api_key.clone(),
            settings.openai_model.clone(),
            "openai".to_string(),
            request,
        ),
        "grok" => stream_openai_compatible(
            ctx,
            settings.grok_base_url.clone(),
            settings.grok_api_key.clone(),
            settings.grok_model.clone(),
            "grok".to_string(),
            request,
        ),
        "claude" => stream_openai_compatible(
            ctx,
            settings.claude_base_url.clone(),
            settings.claude_api_key.clone(),
            settings.claude_model.clone(),
            "claude".to_string(),
            request,
        ),
        "deepseek" => stream_openai_compatible(
            ctx,
            settings.deepseek_base_url.clone(),
            settings.deepseek_api_key.clone(),
            settings.deepseek_model.clone(),
            "deepseek".to_string(),
            request,
        ),
        "soulmd-hub" => {
            let provider = HubChatProvider::new(hub.base_url.clone(), hub.api_key.clone());
            simulate_stream_from_blocking(ctx, &provider, request, "soulmd-hub")
        }
        _ => {
            let provider = MockProvider;
            simulate_stream_from_blocking(ctx, &provider, request, "mock")
        }
    }
}

fn http_client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .unwrap_or_else(|_| Client::new())
}

fn stream_ollama(
    ctx: &mut StreamContext<'_>,
    settings: &GameSettings,
    request: ChatRequest,
    label: &str,
) -> Result<ChatResponse, String> {
    let url = format!(
        "{}/api/chat",
        settings.ollama_base_url.trim_end_matches('/')
    );
    let mut messages = vec![json!({"role": "system", "content": request.system_prompt})];
    for turn in &request.conversation_turns {
        messages.push(json!({"role": turn.role, "content": turn.content}));
    }
    messages.push(json!({"role": "user", "content": request.user_prompt}));

    let body = json!({
        "model": settings.ollama_model,
        "stream": true,
        "messages": messages,
        "options": { "temperature": request.temperature },
    });

    let response = http_client()
        .post(url)
        .json(&body)
        .send()
        .map_err(|e| format!("Ollama stream failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().unwrap_or_default();
        return Err(format!("Ollama stream returned {status}: {text}"));
    }

    let mut content = String::new();
    let reader = BufReader::new(response);
    for line in reader.lines() {
        let line = line.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        let payload: serde_json::Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
        if payload.get("done").and_then(|v| v.as_bool()) == Some(true) {
            break;
        }
        if let Some(delta) = payload
            .get("message")
            .and_then(|m| m.get("content"))
            .and_then(|v| v.as_str())
        {
            content.push_str(delta);
            ctx.emit_delta(delta, false);
        }
    }

    Ok(ChatResponse {
        content,
        provider: label.to_string(),
        usage: TokenUsage {
            source: TokenUsageSource::Estimated,
            ..Default::default()
        },
    })
}

fn stream_openai_compatible(
    ctx: &mut StreamContext<'_>,
    base_url: String,
    api_key: String,
    model: String,
    label: String,
    request: ChatRequest,
) -> Result<ChatResponse, String> {
    if api_key.trim().is_empty() || model.trim().is_empty() {
        return Err(format!("{label} requires API key and model."));
    }

    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let mut messages = vec![json!({"role": "system", "content": request.system_prompt})];
    for turn in &request.conversation_turns {
        messages.push(json!({"role": turn.role, "content": turn.content}));
    }
    messages.push(json!({"role": "user", "content": request.user_prompt}));

    let body = json!({
        "model": model,
        "temperature": request.temperature,
        "stream": true,
        "messages": messages,
    });

    let response = http_client()
        .post(url)
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .json(&body)
        .send()
        .map_err(|e| format!("{label} stream failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().unwrap_or_default();
        return Err(format!("{label} stream returned {status}: {text}"));
    }

    let mut content = String::new();
    let mut reader = BufReader::new(response);
    let mut line = String::new();
    loop {
        line.clear();
        let read = reader.read_line(&mut line).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed == "data: [DONE]" {
            continue;
        }
        let json_line = trimmed.strip_prefix("data: ").unwrap_or(trimmed);
        let payload: serde_json::Value =
            serde_json::from_str(json_line).map_err(|e| format!("SSE parse error: {e}"))?;
        let choice = payload.get("choices").and_then(|c| c.get(0));
        if let Some(delta_obj) = choice.and_then(|c| c.get("delta")) {
            if let Some(reasoning) = delta_obj
                .get("reasoning_content")
                .and_then(|v| v.as_str())
            {
                content.push_str(reasoning);
                ctx.emit_delta(reasoning, true);
            }
            if let Some(delta) = delta_obj.get("content").and_then(|v| v.as_str()) {
                content.push_str(delta);
                ctx.emit_delta(delta, false);
            }
        }
    }

    Ok(ChatResponse {
        content,
        provider: label,
        usage: TokenUsage {
            source: TokenUsageSource::Estimated,
            ..Default::default()
        },
    })
}

fn simulate_stream_from_blocking<P: super::provider::AiProvider>(
    ctx: &mut StreamContext<'_>,
    provider: &P,
    request: ChatRequest,
    label: &str,
) -> Result<ChatResponse, String> {
    let response = provider.chat(request)?;
    for chunk in response.content.as_bytes().chunks(48) {
        let piece = std::str::from_utf8(chunk).unwrap_or("");
        ctx.emit_delta(piece, false);
    }
    Ok(ChatResponse {
        content: response.content,
        provider: label.to_string(),
        usage: response.usage,
    })
}

pub fn simulate_stream_text(ctx: &mut StreamContext<'_>, text: &str) {
    for chunk in text.as_bytes().chunks(48) {
        let piece = std::str::from_utf8(chunk).unwrap_or("");
        ctx.emit_delta(piece, false);
    }
}