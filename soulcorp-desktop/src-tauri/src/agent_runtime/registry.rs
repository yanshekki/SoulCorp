use crate::agent_runtime::types::{RuntimeCatalog, RuntimeCatalogEntry};
use crate::state::GameSettings;
use std::sync::OnceLock;

const EMBEDDED_REGISTRY: &str = include_str!("../../resources/agent_runtimes.json");

static REGISTRY: OnceLock<RuntimeCatalog> = OnceLock::new();

pub fn catalog() -> &'static RuntimeCatalog {
    REGISTRY.get_or_init(|| {
        serde_json::from_str(EMBEDDED_REGISTRY).expect("agent_runtimes.json must be valid")
    })
}

pub fn runtime_by_id(id: &str) -> Option<&'static RuntimeCatalogEntry> {
    let key = id.trim().to_lowercase();
    catalog()
        .runtimes
        .iter()
        .find(|entry| entry.id == key)
}

pub fn is_subprocess_runtime(id: &str) -> bool {
    let key = id.trim().to_lowercase();
    key != "llm_only" && runtime_by_id(&key).is_some()
}

pub fn resolve_runtime_id(settings: &GameSettings) -> String {
    settings.agent_runtime_mode.trim().to_lowercase()
}

pub fn active_runtime(settings: &GameSettings) -> Option<&'static RuntimeCatalogEntry> {
    let id = resolve_runtime_id(settings);
    if id == "llm_only" {
        return None;
    }
    runtime_by_id(&id)
}

pub fn effective_adapter_id(settings: &GameSettings) -> Option<String> {
    let entry = active_runtime(settings)?;
    if entry.id == "custom" {
        let custom = settings.agent_runtime_custom_adapter.trim();
        if custom.is_empty() {
            return Some("legacy_stdin".to_string());
        }
        return Some(custom.to_string());
    }
    Some(entry.adapter.clone())
}

pub fn effective_default_binary(settings: &GameSettings) -> String {
    if let Some(entry) = active_runtime(settings) {
        if entry.id == "custom" {
            return settings.agent_runtime_custom_binary.trim().to_string();
        }
        return entry.default_binary.clone();
    }
    String::new()
}

pub fn effective_label(settings: &GameSettings) -> String {
    active_runtime(settings)
        .map(|entry| entry.label.clone())
        .unwrap_or_else(|| "In-app LLM".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_has_at_least_23_runtimes() {
        assert!(catalog().runtimes.len() >= 23);
    }

    #[test]
    fn grok_runtime_uses_headless_adapter() {
        let grok = runtime_by_id("grok").expect("grok runtime");
        assert_eq!(grok.adapter, "grok_headless");
    }
}