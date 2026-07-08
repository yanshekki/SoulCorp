use crate::brain::{
    normalize_meeting_override, resolve_meeting_provider, supported_meeting_provider_ids,
};
use crate::state::GameSettings;
use std::collections::HashMap;

pub use crate::brain::PROVIDER_DEFAULT;

pub fn supported_providers() -> Vec<String> {
    supported_meeting_provider_ids()
        .into_iter()
        .filter_map(|id| crate::brain::api_provider_for_meeting_id(&id))
        .collect()
}

pub fn normalize_ai_provider_override(raw: Option<&str>) -> Result<Option<String>, String> {
    normalize_meeting_override(raw)
}

pub fn normalize_agent_ai_provider(raw: Option<&str>) -> Result<Option<String>, String> {
    normalize_meeting_override(raw)
}

pub fn department_provider_override<'a>(
    department_providers: &'a HashMap<String, String>,
    department: &str,
) -> Option<&'a str> {
    department_providers.get(department).map(String::as_str)
}

pub fn effective_provider_for_agent(
    settings: &GameSettings,
    department_providers: &HashMap<String, String>,
    department: &str,
    agent_override: Option<&str>,
) -> String {
    resolve_meeting_provider(settings, department_providers, department, agent_override)
}

pub fn provider_label(provider: &str) -> String {
    let registry_id = crate::brain::legacy_meeting_provider_to_registry_id(provider);
    crate::agent_runtime::registry::runtime_by_id(&registry_id)
        .map(|entry| entry.label.clone())
        .unwrap_or_else(|| match provider {
            "ollama" => "Ollama (local)".to_string(),
            "openai" => "OpenAI-compatible".to_string(),
            "grok" => "Grok (xAI)".to_string(),
            "claude" => "Claude-compatible".to_string(),
            "soulmd-hub" => "soulmd-hub API".to_string(),
            _ => "Mock (offline)".to_string(),
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::GameSettings;

    #[test]
    fn agent_override_beats_department_and_company_defaults() {
        let settings = GameSettings {
            ai_provider: "openai".into(),
            ..GameSettings::default()
        };
        let mut departments = HashMap::new();
        departments.insert("Engineering".into(), "grok_api".into());

        let resolved = effective_provider_for_agent(
            &settings,
            &departments,
            "Engineering",
            Some("claude_api"),
        );
        assert_eq!(resolved, "claude");
    }

    #[test]
    fn department_override_beats_company_default() {
        let settings = GameSettings {
            ai_provider: "openai".into(),
            ..GameSettings::default()
        };
        let mut departments = HashMap::new();
        departments.insert("Human Resources".into(), "ollama".into());

        let resolved =
            effective_provider_for_agent(&settings, &departments, "Human Resources", None);
        assert_eq!(resolved, "ollama");
    }

    #[test]
    fn falls_back_to_company_default() {
        let settings = GameSettings {
            ai_provider: "grok".into(),
            ..GameSettings::default()
        };

        let resolved = effective_provider_for_agent(&settings, &HashMap::new(), "Executive", None);
        assert_eq!(resolved, "grok");
    }
}