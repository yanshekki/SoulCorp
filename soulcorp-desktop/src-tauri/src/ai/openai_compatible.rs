use super::provider::{AiProvider, ChatRequest, ChatResponse, TokenUsage, TokenUsageSource};
use super::token_estimate::estimate_from_texts;
use reqwest::blocking::Client;
use serde_json::json;
use std::time::Duration;

pub struct OpenAiCompatibleProvider {
    base_url: String,
    api_key: String,
    model: String,
    label: String,
    client: Client,
}

impl OpenAiCompatibleProvider {
    pub fn new(base_url: String, api_key: String, model: String, label: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            base_url,
            api_key,
            model,
            label,
            client,
        }
    }

    pub fn is_configured(&self) -> bool {
        !self.api_key.trim().is_empty() && !self.model.trim().is_empty()
    }
}

impl AiProvider for OpenAiCompatibleProvider {
    fn name(&self) -> &str {
        &self.label
    }

    fn chat(&self, request: ChatRequest) -> Result<ChatResponse, String> {
        if !self.is_configured() {
            return Err(format!(
                "{} provider requires API key and model in Settings.",
                self.label
            ));
        }

        let url = format!(
            "{}/chat/completions",
            self.base_url.trim_end_matches('/')
        );
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
            "temperature": request.temperature,
            "messages": messages,
        });

        let response = self
            .client
            .post(url)
            .header("Authorization", format!("Bearer {}", self.api_key.trim()))
            .json(&body)
            .send()
            .map_err(|e| format!("{label} request failed: {e}", label = self.label))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().unwrap_or_default();
            return Err(format!("{label} returned {status}: {text}", label = self.label));
        }

        let payload: serde_json::Value = response.json().map_err(|e| e.to_string())?;
        let content = payload
            .get("choices")
            .and_then(|choices| choices.get(0))
            .and_then(|choice| choice.get("message"))
            .and_then(|message| message.get("content"))
            .and_then(|value| value.as_str())
            .ok_or_else(|| format!("{label} response missing choices[0].message.content", label = self.label))?;

        let usage = if let Some(usage_value) = payload.get("usage") {
            let prompt_tokens = usage_value
                .get("prompt_tokens")
                .and_then(|value| value.as_u64())
                .unwrap_or(0) as u32;
            let completion_tokens = usage_value
                .get("completion_tokens")
                .and_then(|value| value.as_u64())
                .unwrap_or(0) as u32;
            let total_tokens = usage_value
                .get("total_tokens")
                .and_then(|value| value.as_u64())
                .unwrap_or(0) as u32;
            TokenUsage {
                prompt_tokens,
                completion_tokens,
                total_tokens: total_tokens.max(prompt_tokens.saturating_add(completion_tokens)),
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
            provider: self.label.clone(),
            usage,
        })
    }
}