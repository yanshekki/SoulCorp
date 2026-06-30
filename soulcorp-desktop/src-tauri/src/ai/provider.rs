use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub system_prompt: String,
    pub user_prompt: String,
    pub temperature: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub content: String,
    pub provider: String,
}

pub trait AiProvider: Send + Sync {
    fn name(&self) -> &str;
    fn chat(&self, request: ChatRequest) -> Result<ChatResponse, String>;
}
