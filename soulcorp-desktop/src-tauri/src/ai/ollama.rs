use super::provider::{AiProvider, ChatRequest, ChatResponse};
use reqwest::blocking::Client;
use serde_json::json;
use std::time::Duration;

pub struct OllamaProvider {
    base_url: String,
    model: String,
    client: Client,
}

impl Default for OllamaProvider {
    fn default() -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            base_url: std::env::var("OLLAMA_HOST")
                .unwrap_or_else(|_| "http://127.0.0.1:11434".to_string()),
            model: std::env::var("OLLAMA_MODEL").unwrap_or_else(|_| "llama3.2".to_string()),
            client,
        }
    }
}

impl AiProvider for OllamaProvider {
    fn name(&self) -> &str {
        "ollama"
    }

    fn chat(&self, request: ChatRequest) -> Result<ChatResponse, String> {
        let url = format!("{}/api/chat", self.base_url.trim_end_matches('/'));
        let body = json!({
            "model": self.model,
            "stream": false,
            "messages": [
                {"role": "system", "content": request.system_prompt},
                {"role": "user", "content": request.user_prompt},
            ],
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

        Ok(ChatResponse {
            content: content.to_string(),
            provider: self.name().to_string(),
        })
    }
}
