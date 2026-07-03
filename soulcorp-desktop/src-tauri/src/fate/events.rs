use crate::ai::provider::ChatRequest;
use crate::ai::{self, BilledChatRequest};
use crate::commands::events::{apply_event, event_template};
use crate::fate::{eligible_for_random_events, event_roll_threshold, FATE_AGENT_ID};
use crate::state::{AppState, GameEvent};
use rand::Rng;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
struct FateEventPayload {
    title: String,
    description: String,
    tone: String,
    morale_delta: f32,
    token_delta: f64,
}

pub fn passes_event_roll(state: &AppState) -> bool {
    let threshold = event_roll_threshold(state);
    if threshold <= 0.0 {
        return false;
    }
    let mut rng = rand::rng();
    rng.random::<f32>() <= threshold
}

pub fn generate_and_apply_fate_event(state: &mut AppState) -> Option<GameEvent> {
    if !eligible_for_random_events(state) {
        return None;
    }

    let event = match generate_fate_event(state) {
        Ok(event) => event,
        Err(error) => {
            eprintln!("Fate event generation failed, using template fallback: {error}");
            template_fallback_event()
        }
    };

    apply_event(state, &event);
    Some(event)
}

fn generate_fate_event(state: &mut AppState) -> Result<GameEvent, String> {
    if state.settings.ai_provider == "mock" {
        return Ok(template_fallback_event());
    }

    let context = build_fate_context(state);
    let request = ChatRequest {
        system_prompt: "You are Fate, the omniscient narrator of an office simulation. \
            Weave one realistic random event grounded in the company's people, industry, and current tensions. \
            Reference specific agent names. Keep consequences plausible. \
            Respond with JSON only, no markdown."
            .to_string(),
        user_prompt: format!(
            "{context}\n\nReturn JSON exactly like:\n\
            {{\"title\":\"...\",\"description\":\"...\",\"tone\":\"positive|negative|chaotic\",\
            \"morale_delta\":0.05,\"token_delta\":120}}\n\
            morale_delta range -0.15..0.15, token_delta range -500..500."
        ),
        temperature: 0.85,
        soul_id: None,
        context: None,
        conversation_turns: Vec::new(),
    };

    let department_providers = state.department_ai_providers.clone();
    let response = ai::chat_with_fallback_billed(
        state,
        BilledChatRequest {
            request,
            agent_id: FATE_AGENT_ID.to_string(),
            department: "Meta".to_string(),
            source: "fate_event".into(),
        },
        &department_providers,
        None,
    )?;

    parse_fate_response(&response.content)
}

fn parse_fate_response(content: &str) -> Result<GameEvent, String> {
    let trimmed = content.trim();
    let json_start = trimmed.find('{').ok_or("Fate response missing JSON object")?;
    let json_end = trimmed
        .rfind('}')
        .ok_or("Fate response missing JSON object end")?;
    let payload: FateEventPayload = serde_json::from_str(&trimmed[json_start..=json_end])
        .map_err(|error| format!("Failed to parse Fate JSON: {error}"))?;

    let tone = match payload.tone.to_lowercase().as_str() {
        "positive" | "negative" | "chaotic" => payload.tone.to_lowercase(),
        _ => "chaotic".to_string(),
    };

    Ok(GameEvent {
        id: Uuid::new_v4().to_string(),
        title: payload.title.trim().to_string(),
        description: payload.description.trim().to_string(),
        tone,
        morale_delta: payload.morale_delta.clamp(-0.15, 0.15),
        cash_delta: payload.token_delta.clamp(-500.0, 500.0),
        narrator: Some("Fate".to_string()),
        generated_by_ai: true,
    })
}

fn template_fallback_event() -> GameEvent {
    let template = event_template(rand::rng().random_range(0..5));
    GameEvent {
        id: Uuid::new_v4().to_string(),
        title: template.1.to_string(),
        description: template.2.to_string(),
        tone: template.0.to_string(),
        morale_delta: template.3,
        cash_delta: template.4,
        narrator: Some("Fate".to_string()),
        generated_by_ai: false,
    }
}

pub fn build_fate_context(state: &AppState) -> String {
    let mut lines = vec![
        format!("Company: {}", state.company_name),
        format!("Industry: {}", state.company_industry),
        format!("Tagline: {}", state.company_tagline),
        format!("Simulation day: {}", state.day_number),
        format!(
            "Company token pool: {}",
            state.token_economy.company_balance
        ),
    ];

    lines.push("Agents:".to_string());
    for agent in state.agents.values() {
        if agent.agent_kind.as_deref() == Some("fate") {
            continue;
        }
        lines.push(format!(
            "- {} ({}, {}): morale {:.0}%, energy {:.0}%, status {}",
            agent.name,
            agent.role,
            agent.department,
            agent.morale * 100.0,
            agent.energy * 100.0,
            agent.status
        ));
    }

    if !state.agent_relationships.is_empty() {
        lines.push("Relationships:".to_string());
        for rel in state.agent_relationships.iter().take(6) {
            let from = state
                .agents
                .get(&rel.from_agent_id)
                .map(|a| a.name.as_str())
                .unwrap_or("unknown");
            let to = state
                .agents
                .get(&rel.to_agent_id)
                .map(|a| a.name.as_str())
                .unwrap_or("unknown");
            lines.push(format!(
                "- {from} -> {to}: {} ({:.0}%)",
                rel.relationship_type, rel.score * 100.0
            ));
        }
    }

    if !state.events.is_empty() {
        lines.push("Recent events:".to_string());
        for event in state.events.iter().rev().take(3) {
            lines.push(format!("- {}: {}", event.title, event.description));
        }
    }

    if !state.gig_contracts.is_empty() {
        lines.push("Active gigs:".to_string());
        for gig in state
            .gig_contracts
            .iter()
            .filter(|g| g.status == "active" || g.status == "in_progress")
            .take(3)
        {
            lines.push(format!(
                "- {} ({:.0}% complete)",
                gig.title,
                gig.progress * 100.0
            ));
        }
    }

    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_fate_json_payload() {
        let raw = r#"{"title":"Mira's Viral Thread","description":"Mira's post spikes inbound leads.","tone":"positive","morale_delta":0.08,"token_delta":220}"#;
        let event = parse_fate_response(raw).expect("parse");
        assert_eq!(event.title, "Mira's Viral Thread");
        assert!(event.generated_by_ai);
        assert_eq!(event.narrator.as_deref(), Some("Fate"));
    }
}