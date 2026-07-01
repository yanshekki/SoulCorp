use crate::state::GameSettings;
use std::collections::HashMap;

pub const PROVIDER_DEFAULT: &str = "default";

pub const SUPPORTED_PROVIDERS: &[&str] = &[
    "mock",
    "ollama",
    "openai",
    "grok",
    "claude",
    "soulmd-hub",
];

pub fn normalize_ai_provider_override(raw: Option<&str>) -> Result<Option<String>, String> {
    let Some(value) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    if value == PROVIDER_DEFAULT {
        return Ok(None);
    }
    if !SUPPORTED_PROVIDERS.contains(&value) {
        return Err(format!(
            "Unsupported AI provider '{value}'. Choose one of: {}",
            SUPPORTED_PROVIDERS.join(", ")
        ));
    }
    Ok(Some(value.to_string()))
}

pub fn normalize_agent_ai_provider(raw: Option<&str>) -> Result<Option<String>, String> {
    normalize_ai_provider_override(raw)
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
    if settings.pure_local_mode {
        return "mock".to_string();
    }

    if let Some(agent_provider) = agent_override
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != PROVIDER_DEFAULT)
    {
        return agent_provider.to_string();
    }

    if let Some(department_provider) = department_provider_override(department_providers, department)
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != PROVIDER_DEFAULT)
    {
        return department_provider.to_string();
    }

    settings.ai_provider.clone()
}

pub fn effective_provider(
    settings: &GameSettings,
    agent_override: Option<&str>,
) -> String {
    effective_provider_for_agent(settings, &HashMap::new(), "", agent_override)
}

pub fn provider_label(provider: &str) -> &'static str {
    match provider {
        "ollama" => "Ollama (local)",
        "openai" => "OpenAI-compatible",
        "grok" => "Grok (xAI)",
        "claude" => "Claude-compatible",
        "soulmd-hub" => "soulmd-hub API",
        _ => "Mock (offline)",
    }
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
        departments.insert("Engineering".into(), "grok".into());

        let resolved = effective_provider_for_agent(
            &settings,
            &departments,
            "Engineering",
            Some("claude"),
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