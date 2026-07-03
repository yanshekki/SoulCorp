use super::provider::{ChatRequest, TokenUsage, TokenUsageSource};

pub fn estimate_tokens(text: &str) -> u32 {
    if text.is_empty() {
        return 0;
    }
    (((text.chars().count() as f64) / 4.0).ceil() as u32).max(1)
}

pub fn estimate_request(request: &ChatRequest) -> u32 {
    let mut total = estimate_tokens(&request.system_prompt)
        .saturating_add(
            request
                .context
                .as_deref()
                .map(estimate_tokens)
                .unwrap_or(0),
        )
        + estimate_tokens(&request.user_prompt);
    for turn in &request.conversation_turns {
        total = total.saturating_add(estimate_tokens(&turn.content));
    }
    total.max(1)
}

pub fn estimate_from_texts(prompt: &str, completion: &str) -> TokenUsage {
    let prompt_tokens = estimate_tokens(prompt);
    let completion_tokens = estimate_tokens(completion);
    TokenUsage {
        prompt_tokens,
        completion_tokens,
        total_tokens: prompt_tokens.saturating_add(completion_tokens).max(1),
        source: TokenUsageSource::Estimated,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_text_is_zero() {
        assert_eq!(estimate_tokens(""), 0);
    }

    #[test]
    fn short_text_is_at_least_one() {
        assert_eq!(estimate_tokens("hi"), 1);
    }
}