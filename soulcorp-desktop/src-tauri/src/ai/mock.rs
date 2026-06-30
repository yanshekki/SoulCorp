use super::provider::{AiProvider, ChatRequest, ChatResponse};

pub struct MockProvider;

impl AiProvider for MockProvider {
    fn name(&self) -> &str {
        "mock"
    }

    fn chat(&self, request: ChatRequest) -> Result<ChatResponse, String> {
        let snippet = request
            .user_prompt
            .lines()
            .next()
            .unwrap_or("Let's keep momentum on the roadmap.")
            .trim()
            .to_string();

        let content = if request.system_prompt.contains("meeting") {
            format!("{snippet} I can take the next action item and report back tomorrow.")
        } else {
            format!("{snippet} (mock provider response grounded in SOUL.md personality.)")
        };

        Ok(ChatResponse {
            content,
            provider: self.name().to_string(),
        })
    }
}
