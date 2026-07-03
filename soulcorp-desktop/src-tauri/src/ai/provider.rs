use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatTurn {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    /// Persona prompt (soul-derived). Task/meeting context lives in [`Self::context`].
    pub system_prompt: String,
    pub user_prompt: String,
    pub temperature: f32,
    #[serde(default)]
    pub soul_id: Option<u64>,
    /// Meeting, scrum, or task context — used by hub provider instead of parsing `system_prompt`.
    #[serde(default)]
    pub context: Option<String>,
    #[serde(default)]
    pub conversation_turns: Vec<ChatTurn>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TokenUsageSource {
    Api,
    Estimated,
    Zero,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub source: TokenUsageSource,
}

impl Default for TokenUsage {
    fn default() -> Self {
        Self {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            source: TokenUsageSource::Zero,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub content: String,
    pub provider: String,
    #[serde(default)]
    pub usage: TokenUsage,
}

pub trait AiProvider: Send + Sync {
    fn name(&self) -> &str;
    fn chat(&self, request: ChatRequest) -> Result<ChatResponse, String>;
}
