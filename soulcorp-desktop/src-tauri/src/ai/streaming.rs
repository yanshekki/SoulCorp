use super::health::{probe_agent_ai, MeetingAiStatus};
use super::mock::MockProvider;
use super::provider::{AiProvider, ChatRequest, ChatResponse, TokenUsage, TokenUsageSource};
use super::token_estimate;
use super::{BilledChatRequest, HubChatProvider};
use crate::agent_activity::{emit_content_full_live, emit_token_delta, emit_token_delta_live};
use crate::progress::ProgressReporter;
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

/// Stream emitter that never locks AppState — tokens reach the UI immediately.
pub struct LiveStreamEmitter<'a> {
    pub app: Option<&'a AppHandle>,
    pub session_id: &'a str,
    pub agent_id: &'a str,
    pub step: Option<&'a str>,
    pub enabled: bool,
}

impl<'a> LiveStreamEmitter<'a> {
    pub fn emit_delta(&self, delta: &str, reasoning: bool) {
        if !self.enabled {
            return;
        }
        emit_token_delta_live(
            self.app,
            self.session_id,
            self.agent_id,
            self.step,
            delta,
            reasoning,
        );
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
            crate::app_log::log_global(
                crate::app_log::LogLevel::Warn,
                crate::app_log::LogCategory::Ai,
                "chat_stream",
                format!(
                    "Stream provider '{}' failed, using mock fallback: {error}",
                    status.active_provider
                ),
                None,
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
        // Keep meeting/execution streams from hanging the UI for minutes with empty output.
        .timeout(Duration::from_secs(60))
        .connect_timeout(Duration::from_secs(8))
        .build()
        .unwrap_or_else(|_| Client::new())
}

/// Meeting-friendly stream: no AppState lock held during HTTP.
/// Always emits live tokens to the UI (meeting panel must show content even if
/// Observatory stream toggle is off).
pub fn chat_stream_unlocked(
    app: &AppHandle,
    settings: &GameSettings,
    hub: &HubState,
    department_providers: &HashMap<String, String>,
    agent_override: Option<&str>,
    billed: BilledChatRequest,
    session_id: &str,
    progress: Option<&ProgressReporter>,
) -> Result<ChatResponse, String> {
    let status = probe_agent_ai(
        settings,
        hub,
        department_providers,
        &billed.department,
        agent_override,
    );
    // Force live emit for meetings — do not gate on agent_activity_stream_enabled.
    let emitter = LiveStreamEmitter {
        app: Some(app),
        session_id,
        agent_id: &billed.agent_id,
        step: Some("stream"),
        enabled: true,
    };

    if let Some(p) = progress {
        p.emit_indeterminate(
            format!("Connecting to {}…", status.active_provider),
            Some("llm"),
        );
    }

    let result = stream_with_live_emitter(
        &emitter,
        progress,
        &status,
        settings,
        hub,
        billed.request.clone(),
    );

    match result {
        Ok(response) => {
            // Always push full text so the panel is never blank after a successful turn.
            emit_content_full_live(
                Some(app),
                session_id,
                &billed.agent_id,
                Some("stream"),
                &response.content,
            );
            // Do NOT say "saving…" here — applying the turn happens after re-acquiring the
            // app lock (which can wait on the worker). Misleading label made the UI look stuck.
            if let Some(p) = progress {
                p.emit_indeterminate("Turn streamed — applying…", Some("llm"));
            }
            Ok(response)
        }
        Err(error) if settings.meeting_llm_fallback && status.active_provider != "mock" => {
            crate::app_log::log_global(
                crate::app_log::LogLevel::Warn,
                crate::app_log::LogCategory::Ai,
                "chat_stream",
                format!(
                    "Stream provider '{}' failed, using mock fallback: {error}",
                    status.active_provider
                ),
                None,
            );
            if let Some(p) = progress {
                p.emit_indeterminate(
                    format!("Live LLM failed — mock fallback… ({error})"),
                    Some("llm"),
                );
            }
            let fallback = MockProvider;
            let mut response = fallback.chat(billed.request)?;
            for chunk in response.content.as_bytes().chunks(40) {
                let piece = std::str::from_utf8(chunk).unwrap_or("");
                emitter.emit_delta(piece, false);
            }
            emit_content_full_live(
                Some(app),
                session_id,
                &billed.agent_id,
                Some("stream"),
                &response.content,
            );
            response.provider = format!("mock-fallback ({})", status.active_provider);
            Ok(response)
        }
        Err(error) => Err(error),
    }
}

fn stream_with_live_emitter(
    emitter: &LiveStreamEmitter<'_>,
    progress: Option<&ProgressReporter>,
    status: &MeetingAiStatus,
    settings: &GameSettings,
    hub: &HubState,
    request: ChatRequest,
) -> Result<ChatResponse, String> {
    match status.active_provider.as_str() {
        "ollama" => stream_ollama_live(emitter, progress, settings, request, "ollama"),
        "openai" => stream_openai_compatible_live(
            emitter,
            progress,
            settings.openai_base_url.clone(),
            settings.openai_api_key.clone(),
            settings.openai_model.clone(),
            "openai".to_string(),
            request,
        ),
        "grok" => stream_openai_compatible_live(
            emitter,
            progress,
            settings.grok_base_url.clone(),
            settings.grok_api_key.clone(),
            settings.grok_model.clone(),
            "grok".to_string(),
            request,
        ),
        "claude" => stream_openai_compatible_live(
            emitter,
            progress,
            settings.claude_base_url.clone(),
            settings.claude_api_key.clone(),
            settings.claude_model.clone(),
            "claude".to_string(),
            request,
        ),
        "deepseek" => stream_openai_compatible_live(
            emitter,
            progress,
            settings.deepseek_base_url.clone(),
            settings.deepseek_api_key.clone(),
            settings.deepseek_model.clone(),
            "deepseek".to_string(),
            request,
        ),
        "soulmd-hub" => {
            let provider = HubChatProvider::new(hub.base_url.clone(), hub.api_key.clone());
            simulate_stream_live(emitter, progress, &provider, request, "soulmd-hub")
        }
        _ => {
            let provider = MockProvider;
            simulate_stream_live(emitter, progress, &provider, request, "mock")
        }
    }
}

fn stream_openai_compatible_live(
    emitter: &LiveStreamEmitter<'_>,
    progress: Option<&ProgressReporter>,
    base_url: String,
    api_key: String,
    model: String,
    label: String,
    request: ChatRequest,
) -> Result<ChatResponse, String> {
    if api_key.trim().is_empty() || model.trim().is_empty() {
        return Err(format!("{label} requires API key and model in Settings."));
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

    if let Some(p) = progress {
        p.emit_indeterminate(
            format!("Waiting for {label} ({model}) — network…"),
            Some("llm"),
        );
    }

    let response = http_client()
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .json(&body)
        .send()
        .map_err(|e| format!("{label} stream failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().unwrap_or_default();
        let snippet: String = text.chars().take(240).collect();
        return Err(format!("{label} stream returned {status}: {snippet}"));
    }

    if let Some(p) = progress {
        p.emit_indeterminate(format!("Streaming from {label}…"), Some("llm"));
    }

    let mut content = String::new();
    let mut reasoning_buf = String::new();
    let mut got_token = false;
    let mut first_token_at: Option<std::time::Instant> = None;
    let started = std::time::Instant::now();
    let mut reader = BufReader::new(response);
    let mut line = String::new();
    loop {
        // Fail fast if the provider never starts producing tokens (UI otherwise stuck
        // on "Waiting for tokens…" indefinitely when the body hangs open).
        if !got_token && started.elapsed() > Duration::from_secs(25) {
            return Err(format!(
                "{label} stream: no tokens after 25s (model={model}). Check network/model name."
            ));
        }
        if got_token {
            if let Some(first) = first_token_at {
                // Cap total stream length once started so a runaway reasoner can't freeze the turn.
                if first.elapsed() > Duration::from_secs(90) {
                    break;
                }
            }
        }

        line.clear();
        let read = reader.read_line(&mut line).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed == "data: [DONE]" {
            break;
        }
        let json_line = trimmed.strip_prefix("data: ").unwrap_or(trimmed);
        let payload: serde_json::Value = match serde_json::from_str(json_line) {
            Ok(v) => v,
            Err(_) => continue, // skip keep-alives / non-JSON
        };
        // Some providers surface stream errors inside the SSE body.
        if let Some(err) = payload
            .get("error")
            .and_then(|e| e.get("message").and_then(|m| m.as_str()).or_else(|| e.as_str()))
        {
            return Err(format!("{label} stream error: {err}"));
        }
        let choice = payload.get("choices").and_then(|c| c.get(0));
        if let Some(delta_obj) = choice.and_then(|c| c.get("delta")) {
            // DeepSeek V4 streams thinking into reasoning_content first; still show it live.
            if let Some(reasoning) = delta_obj
                .get("reasoning_content")
                .and_then(|v| v.as_str())
            {
                if !reasoning.is_empty() {
                    reasoning_buf.push_str(reasoning);
                    // Prefer final `content` for the meeting transcript, but stream reasoning
                    // so Mind stream is never blank while the model "thinks".
                    emitter.emit_delta(reasoning, true);
                    got_token = true;
                    first_token_at.get_or_insert_with(std::time::Instant::now);
                }
            }
            if let Some(delta) = delta_obj.get("content").and_then(|v| v.as_str()) {
                if !delta.is_empty() {
                    content.push_str(delta);
                    emitter.emit_delta(delta, false);
                    got_token = true;
                    first_token_at.get_or_insert_with(std::time::Instant::now);
                }
            }
        }
        // Non-stream-shaped fallback some gateways still return mid-SSE.
        if let Some(message_obj) = choice.and_then(|c| c.get("message")) {
            let body = message_obj
                .get("content")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .or_else(|| {
                    message_obj
                        .get("reasoning_content")
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                });
            if let Some(message) = body {
                if !content.ends_with(message) && !reasoning_buf.ends_with(message) {
                    let append = if content.is_empty() && reasoning_buf.is_empty() {
                        message
                    } else {
                        let already = if !content.is_empty() {
                            content.as_str()
                        } else {
                            reasoning_buf.as_str()
                        };
                        if message.starts_with(already) {
                            &message[already.len()..]
                        } else {
                            message
                        }
                    };
                    if !append.is_empty() {
                        content.push_str(append);
                        emitter.emit_delta(append, false);
                        got_token = true;
                        first_token_at.get_or_insert_with(std::time::Instant::now);
                    }
                }
            }
        }
        if !got_token && started.elapsed().as_secs() % 3 == 0 {
            if let Some(p) = progress {
                p.emit_indeterminate(
                    format!(
                        "Waiting for {label} tokens… ({}s)",
                        started.elapsed().as_secs()
                    ),
                    Some("llm"),
                );
            }
        }
    }

    // Prefer visible answer content; if the model only produced reasoning, use that.
    if content.trim().is_empty() && !reasoning_buf.trim().is_empty() {
        content = reasoning_buf;
    }

    if content.trim().is_empty() {
        return Err(format!(
            "{label} stream finished with empty content (model={model}, tokens_seen={got_token})."
        ));
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

fn stream_ollama_live(
    emitter: &LiveStreamEmitter<'_>,
    progress: Option<&ProgressReporter>,
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

    if let Some(p) = progress {
        p.emit_indeterminate(format!("Waiting for Ollama ({})…", settings.ollama_model), Some("llm"));
    }

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

    if let Some(p) = progress {
        p.emit_indeterminate("Streaming from Ollama…", Some("llm"));
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
            emitter.emit_delta(delta, false);
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

fn simulate_stream_live<P: super::provider::AiProvider>(
    emitter: &LiveStreamEmitter<'_>,
    progress: Option<&ProgressReporter>,
    provider: &P,
    request: ChatRequest,
    label: &str,
) -> Result<ChatResponse, String> {
    if let Some(p) = progress {
        p.emit_indeterminate(format!("Running {label}…"), Some("llm"));
    }
    let response = provider.chat(request)?;
    for chunk in response.content.as_bytes().chunks(48) {
        let piece = std::str::from_utf8(chunk).unwrap_or("");
        emitter.emit_delta(piece, false);
    }
    Ok(ChatResponse {
        content: response.content,
        provider: label.to_string(),
        usage: response.usage,
    })
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