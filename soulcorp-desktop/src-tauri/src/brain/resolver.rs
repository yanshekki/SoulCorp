use crate::agent_runtime::registry::runtime_by_id;
use crate::state::{AgentRecord, GameSettings};
use std::collections::HashMap;

pub const PROVIDER_DEFAULT: &str = "default";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BrainLayer {
    Meeting,
    Execution,
}

impl BrainLayer {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Meeting => "meeting",
            Self::Execution => "execution",
        }
    }
}

pub fn supported_meeting_provider_ids() -> Vec<String> {
    crate::agent_runtime::registry::catalog()
        .runtimes
        .iter()
        .filter(|entry| entry.layers.iter().any(|layer| layer == "meeting"))
        .map(|entry| entry.id.clone())
        .collect()
}

pub fn legacy_meeting_provider_to_registry_id(provider: &str) -> String {
    let key = provider.trim().to_lowercase();
    match key.as_str() {
        "mock" | "ollama" | "openai_api" | "grok_api" | "claude_api" | "soulmd_hub" => key,
        "openai" => "openai_api".to_string(),
        "grok" => "grok_api".to_string(),
        "claude" => "claude_api".to_string(),
        "soulmd-hub" => "soulmd_hub".to_string(),
        other => other.to_string(),
    }
}

pub fn api_provider_for_meeting_id(registry_id: &str) -> Option<String> {
    let entry = runtime_by_id(registry_id)?;
    if !entry.layers.iter().any(|layer| layer == "meeting") {
        return None;
    }
    entry
        .api_provider_id
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| Some(registry_id.to_string()))
}

pub fn normalize_meeting_override(raw: Option<&str>) -> Result<Option<String>, String> {
    let Some(value) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    if value == PROVIDER_DEFAULT {
        return Ok(None);
    }

    let registry_id = legacy_meeting_provider_to_registry_id(value);
    let entry = runtime_by_id(&registry_id).ok_or_else(|| {
        format!(
            "Unsupported meeting brain '{value}'. Choose one of: {}",
            supported_meeting_provider_ids().join(", ")
        )
    })?;
    if !entry.layers.iter().any(|layer| layer == "meeting") {
        return Err(format!("'{value}' is not a meeting brain."));
    }
    Ok(Some(registry_id))
}

pub fn normalize_execution_override(raw: Option<&str>) -> Result<Option<String>, String> {
    let Some(value) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    if value == PROVIDER_DEFAULT {
        return Ok(None);
    }

    let registry_id = value.to_lowercase();
    let entry = runtime_by_id(&registry_id).ok_or_else(|| {
        format!("Unsupported execution runtime '{value}'.")
    })?;
    if !entry.layers.iter().any(|layer| layer == "execution") {
        return Err(format!("'{value}' is not an execution runtime."));
    }
    Ok(Some(registry_id))
}

pub fn department_runtime_override<'a>(
    department_runtimes: &'a HashMap<String, String>,
    department: &str,
) -> Option<&'a str> {
    department_runtimes.get(department).map(String::as_str)
}

pub fn resolve_meeting_provider(
    settings: &GameSettings,
    department_providers: &HashMap<String, String>,
    department: &str,
    agent_override: Option<&str>,
) -> String {
    if settings.pure_local_mode {
        return "mock".to_string();
    }

    let registry_id = resolve_meeting_registry_id(
        settings,
        department_providers,
        department,
        agent_override,
    );
    api_provider_for_meeting_id(&registry_id).unwrap_or(registry_id)
}

pub fn resolve_meeting_registry_id(
    settings: &GameSettings,
    department_providers: &HashMap<String, String>,
    department: &str,
    agent_override: Option<&str>,
) -> String {
    if let Some(agent_provider) = agent_override
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != PROVIDER_DEFAULT)
    {
        return legacy_meeting_provider_to_registry_id(agent_provider);
    }

    if let Some(department_provider) = department_providers
        .get(department)
        .map(String::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != PROVIDER_DEFAULT)
    {
        return legacy_meeting_provider_to_registry_id(department_provider);
    }

    legacy_meeting_provider_to_registry_id(&settings.ai_provider)
}

pub fn resolve_execution_runtime(
    settings: &GameSettings,
    department_runtimes: &HashMap<String, String>,
    department: &str,
    agent: &AgentRecord,
) -> String {
    if let Some(agent_runtime) = agent
        .agent_runtime_mode
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != PROVIDER_DEFAULT)
    {
        return agent_runtime.to_lowercase();
    }

    if let Some(department_runtime) = department_runtime_override(department_runtimes, department)
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != PROVIDER_DEFAULT)
    {
        return department_runtime.to_lowercase();
    }

    settings.agent_runtime_mode.trim().to_lowercase()
}

pub fn effective_meeting_label(
    settings: &GameSettings,
    department_providers: &HashMap<String, String>,
    department: &str,
    agent_override: Option<&str>,
) -> String {
    let registry_id = resolve_meeting_registry_id(
        settings,
        department_providers,
        department,
        agent_override,
    );
    runtime_by_id(&registry_id)
        .map(|entry| entry.label.clone())
        .unwrap_or_else(|| registry_id)
}

pub fn effective_execution_label(runtime_id: &str) -> String {
    runtime_by_id(runtime_id)
        .map(|entry| entry.label.clone())
        .unwrap_or_else(|| {
            if runtime_id == "llm_only" {
                "In-app LLM only".to_string()
            } else {
                runtime_id.to_string()
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::GameSettings;

    #[test]
    fn meeting_agent_override_beats_department_and_company() {
        let settings = GameSettings {
            ai_provider: "openai".into(),
            ..GameSettings::default()
        };
        let mut departments = HashMap::new();
        departments.insert("Engineering".into(), "grok_api".into());

        let resolved = resolve_meeting_provider(&settings, &departments, "Engineering", Some("claude_api"));
        assert_eq!(resolved, "claude");
    }

    #[test]
    fn execution_agent_override_beats_department_and_company() {
        let settings = GameSettings {
            agent_runtime_mode: "llm_only".into(),
            ..GameSettings::default()
        };
        let mut department_runtimes = HashMap::new();
        department_runtimes.insert("Engineering".into(), "openclaw".into());
        let agent = AgentRecord {
            id: "a1".into(),
            name: "Dev".into(),
            role: "Engineer".into(),
            department: "Engineering".into(),
            morale: 1.0,
            energy: 1.0,
            salary: 0.0,
            status: "idle".into(),
            soul: None,
            soul_id: None,
            ai_provider: None,
            agent_runtime_mode: Some("codex".into()),
            agent_kind: None,
            skills: vec![],
            reports_to: None,
            manages_department: None,
        };

        assert_eq!(
            resolve_execution_runtime(&settings, &department_runtimes, "Engineering", &agent),
            "codex"
        );
    }

    #[test]
    fn legacy_openai_maps_to_openai_api() {
        assert_eq!(legacy_meeting_provider_to_registry_id("openai"), "openai_api");
        assert_eq!(api_provider_for_meeting_id("openai_api").as_deref(), Some("openai"));
    }
}