use super::provider::{AiProvider, ChatRequest, ChatResponse, TokenUsage, TokenUsageSource};
use super::token_estimate::estimate_from_texts;
use reqwest::blocking::Client;
use serde_json::json;
use std::time::Duration;

pub struct OllamaProvider {
    base_url: String,
    model: String,
    client: Client,
}

impl OllamaProvider {
    pub fn new(base_url: String, model: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            base_url,
            model,
            client,
        }
    }

    pub fn is_reachable(&self) -> bool {
        let url = format!("{}/api/tags", self.base_url.trim_end_matches('/'));
        self.client
            .get(url)
            .send()
            .map(|response| response.status().is_success())
            .unwrap_or(false)
    }
}

impl Default for OllamaProvider {
    fn default() -> Self {
        Self::new(
            std::env::var("OLLAMA_HOST")
                .unwrap_or_else(|_| "http://127.0.0.1:11434".to_string()),
            std::env::var("OLLAMA_MODEL").unwrap_or_else(|_| "llama3.2".to_string()),
        )
    }
}

impl AiProvider for OllamaProvider {
    fn name(&self) -> &str {
        "ollama"
    }

    fn chat(&self, request: ChatRequest) -> Result<ChatResponse, String> {
        let url = format!("{}/api/chat", self.base_url.trim_end_matches('/'));
        let mut messages = vec![json!({"role": "system", "content": request.system_prompt})];
        for turn in &request.conversation_turns {
            messages.push(json!({
                "role": turn.role,
                "content": turn.content,
            }));
        }
        messages.push(json!({"role": "user", "content": request.user_prompt}));

        let body = json!({
            "model": self.model,
            "stream": false,
            "messages": messages,
            "options": {
                "temperature": request.temperature,
            }
        });

        let response = self
            .client
            .post(url)
            .json(&body)
            .send()
            .map_err(|e| format!("Ollama request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().unwrap_or_default();
            return Err(format!("Ollama returned {status}: {text}"));
        }

        let payload: serde_json::Value = response.json().map_err(|e| e.to_string())?;
        let content = payload
            .get("message")
            .and_then(|message| message.get("content"))
            .and_then(|value| value.as_str())
            .ok_or_else(|| "Ollama response missing message.content.".to_string())?;

        let usage = if payload.get("prompt_eval_count").is_some() || payload.get("eval_count").is_some() {
            let prompt_tokens = payload
                .get("prompt_eval_count")
                .and_then(|value| value.as_u64())
                .unwrap_or(0) as u32;
            let completion_tokens = payload
                .get("eval_count")
                .and_then(|value| value.as_u64())
                .unwrap_or(0) as u32;
            TokenUsage {
                prompt_tokens,
                completion_tokens,
                total_tokens: prompt_tokens.saturating_add(completion_tokens).max(1),
                source: TokenUsageSource::Api,
            }
        } else {
            let prompt_text = messages
                .iter()
                .filter_map(|message| message.get("content").and_then(|value| value.as_str()))
                .collect::<Vec<_>>()
                .join("\n");
            estimate_from_texts(&prompt_text, content)
        };

        Ok(ChatResponse {
            content: content.to_string(),
            provider: self.name().to_string(),
            usage,
        })
    }
}
