use super::provider::{AiProvider, ChatRequest, ChatResponse};
use super::token_estimate::estimate_from_texts;
use reqwest::blocking::Client;
use serde_json::json;
use std::time::Duration;
use uuid::Uuid;

pub struct HubChatProvider {
    base_url: String,
    api_key: Option<String>,
    client: Client,
}

impl HubChatProvider {
    pub fn is_reachable(&self) -> bool {
        let api_key = match self.api_key.as_ref().filter(|key| !key.trim().is_empty()) {
            Some(key) => key,
            None => return false,
        };

        let url = format!("{}/api/souls.php?limit=1", self.base_url.trim_end_matches('/'));
        self.client
            .get(url)
            .header("Authorization", format!("Bearer {api_key}"))
            .send()
            .map(|response| response.status().is_success())
            .unwrap_or(false)
    }

    pub fn new(base_url: String, api_key: Option<String>) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(180))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            base_url,
            api_key,
            client,
        }
    }
}

impl AiProvider for HubChatProvider {
    fn name(&self) -> &str {
        "soulmd-hub"
    }

    fn chat(&self, request: ChatRequest) -> Result<ChatResponse, String> {
        let api_key = self
            .api_key
            .as_ref()
            .filter(|key| !key.trim().is_empty())
            .ok_or_else(|| {
                "soulmd-hub provider requires an API key. Configure it in Hub settings.".to_string()
            })?;

        let soul_id = request.soul_id.ok_or_else(|| {
            "soulmd-hub requires a hub-linked agent. Use a local LLM for preset or edited personas."
                .to_string()
        })?;

        let url = format!("{}/api/chat", self.base_url.trim_end_matches('/'));
        let session_token = format!("soulcorp-{}", Uuid::new_v4());
        let transcript = request
            .conversation_turns
            .iter()
            .map(|turn| format!("{}: {}", turn.role, turn.content))
            .collect::<Vec<_>>()
            .join("\n");

        // Hub loads persona from soul_id; only forward explicit task/meeting context.
        let context_block = request
            .context
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("Respond in character.");

        let content = if transcript.is_empty() {
            format!("{context_block}\n\nUser request:\n{}", request.user_prompt)
        } else {
            format!(
                "{context_block}\n\nMeeting transcript so far:\n{transcript}\n\nNow respond as the active speaker:\n{}",
                request.user_prompt
            )
        };

        let body = json!({
            "action": "chat",
            "soul_id": soul_id,
            "session_token": session_token,
            "content": content,
            "is_private": true
        });

        let response = self
            .client
            .post(url)
            .header("Authorization", format!("Bearer {api_key}"))
            .json(&body)
            .send()
            .map_err(|e| format!("soulmd-hub request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().unwrap_or_default();
            return Err(format!("soulmd-hub returned {status}: {text}"));
        }

        let payload: serde_json::Value = response.json().map_err(|e| e.to_string())?;
        if payload.get("success").and_then(|v| v.as_bool()) == Some(false) {
            let message = payload
                .get("message")
                .or_else(|| payload.get("error"))
                .and_then(|v| v.as_str())
                .unwrap_or("soulmd-hub chat failed.");
            return Err(message.to_string());
        }

        let content = payload
            .get("reply")
            .and_then(|value| value.as_str())
            .or_else(|| {
                payload
                    .get("messages")
                    .and_then(|messages| messages.as_array())
                    .and_then(|items| items.last())
                    .and_then(|message| message.get("content"))
                    .and_then(|value| value.as_str())
            })
            .ok_or_else(|| "soulmd-hub response missing reply.".to_string())?;

        Ok(ChatResponse {
            content: content.to_string(),
            provider: self.name().to_string(),
            usage: estimate_from_texts(&content, content.trim()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::provider::ChatRequest;

    #[test]
    fn requires_hub_linked_soul_id() {
        let provider = HubChatProvider::new("http://localhost".to_string(), Some("test-key".to_string()));
        let request = ChatRequest {
            system_prompt: "persona".into(),
            user_prompt: "hello".into(),
            temperature: 0.7,
            soul_id: None,
            context: None,
            conversation_turns: Vec::new(),
        };
        let err = provider.chat(request).expect_err("missing soul_id should fail");
        assert!(err.contains("hub-linked agent"));
    }
}