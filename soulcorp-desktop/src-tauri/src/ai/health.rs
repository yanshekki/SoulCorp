use super::hub_chat::HubChatProvider;
use super::ollama::OllamaProvider;
use super::selection::{effective_provider_for_agent, provider_label};
use crate::state::{GameSettings, HubState};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingAiStatus {
    pub configured_provider: String,
    pub active_provider: String,
    pub ollama_reachable: bool,
    pub hub_configured: bool,
    pub hub_reachable: bool,
    pub ollama_model: String,
    pub ollama_base_url: String,
    pub meeting_turns_per_agent: u32,
    pub fallback_enabled: bool,
    pub message: String,
}

pub fn probe_meeting_ai(settings: &GameSettings, hub: &HubState) -> MeetingAiStatus {
    probe_agent_ai(settings, hub, &HashMap::new(), "", None)
}

pub fn probe_agent_ai(
    settings: &GameSettings,
    hub: &HubState,
    department_providers: &HashMap<String, String>,
    department: &str,
    agent_provider_override: Option<&str>,
) -> MeetingAiStatus {
    let configured_provider = effective_provider_for_agent(
        settings,
        department_providers,
        department,
        agent_provider_override,
    );
    let ollama = OllamaProvider::new(settings.ollama_base_url.clone(), settings.ollama_model.clone());
    let ollama_reachable = ollama.is_reachable();

    let hub_configured = hub
        .api_key
        .as_ref()
        .map(|key| !key.trim().is_empty())
        .unwrap_or(false);
    let hub_reachable = if hub_configured {
        HubChatProvider::new(hub.base_url.clone(), hub.api_key.clone()).is_reachable()
    } else {
        false
    };

    let active_provider = resolve_active_provider(
        &configured_provider,
        settings,
        ollama_reachable,
        hub_configured,
        hub_reachable,
    );

    let message = status_message(
        &active_provider,
        settings,
        department,
        agent_provider_override,
        ollama_reachable,
        hub_reachable,
    );

    MeetingAiStatus {
        configured_provider,
        active_provider,
        ollama_reachable,
        hub_configured,
        hub_reachable,
        ollama_model: settings.ollama_model.clone(),
        ollama_base_url: settings.ollama_base_url.clone(),
        meeting_turns_per_agent: settings.meeting_turns_per_agent,
        fallback_enabled: settings.meeting_llm_fallback,
        message,
    }
}

fn status_message(
    active_provider: &str,
    settings: &GameSettings,
    department: &str,
    agent_provider_override: Option<&str>,
    ollama_reachable: bool,
    hub_reachable: bool,
) -> String {
    let scope = if agent_provider_override.is_some() {
        "This agent"
    } else if !department.is_empty() {
        &format!("{department} department")
    } else {
        "Meetings"
    };

    match active_provider {
        "ollama" => format!(
            "{scope} will use Ollama ({}) at {}.",
            settings.ollama_model, settings.ollama_base_url
        ),
        "openai" => format!(
            "{scope} will use OpenAI-compatible API ({}) at {}.",
            settings.openai_model, settings.openai_base_url
        ),
        "grok" => format!(
            "{scope} will use Grok API ({}) at {}.",
            settings.grok_model, settings.grok_base_url
        ),
        "claude" => format!(
            "{scope} will use Claude-compatible API ({}) at {}.",
            settings.claude_model, settings.claude_base_url
        ),
        "deepseek" => format!(
            "{scope} will use DeepSeek API ({}) at {}.",
            settings.deepseek_model, settings.deepseek_base_url
        ),
        "soulmd-hub" => format!("{scope} will use soulmd-hub chat API."),
        "mock" if settings.ai_provider == "ollama" && !ollama_reachable => {
            "Ollama is unreachable — dialogue will fall back to mock.".to_string()
        }
        "mock" if settings.ai_provider == "soulmd-hub" && !hub_reachable => {
            "soulmd-hub is not ready — dialogue will fall back to mock.".to_string()
        }
        "mock" if agent_provider_override.is_some() || !department.is_empty() => format!(
            "Configured provider is {} but runtime will use mock dialogue.",
            provider_label(active_provider)
        ),
        _ => format!("{scope} will use mock dialogue for offline play."),
    }
}

fn resolve_active_provider(
    configured_provider: &str,
    settings: &GameSettings,
    ollama_reachable: bool,
    hub_configured: bool,
    hub_reachable: bool,
) -> String {
    if settings.pure_local_mode {
        return "mock".to_string();
    }

    match configured_provider {
        "ollama" if ollama_reachable => "ollama".to_string(),
        "openai" if !settings.openai_api_key.trim().is_empty() => "openai".to_string(),
        "grok" if !settings.grok_api_key.trim().is_empty() => "grok".to_string(),
        "claude" if !settings.claude_api_key.trim().is_empty() => "claude".to_string(),
        "deepseek" if !settings.deepseek_api_key.trim().is_empty() => "deepseek".to_string(),
        "soulmd-hub" | "soulmd_hub" | "hub" if hub_configured && hub_reachable => {
            "soulmd-hub".to_string()
        }
        "soulmd-hub" | "soulmd_hub" | "hub" if hub_configured => "soulmd-hub".to_string(),
        "mock" => "mock".to_string(),
        _ if settings.meeting_llm_fallback => "mock".to_string(),
        other => other.to_string(),
    }
}

/// Normalized company meeting-provider id (api layer: openai/grok/deepseek/…).
pub fn configured_meeting_provider(settings: &GameSettings) -> String {
    let registry = crate::brain::legacy_meeting_provider_to_registry_id(&settings.ai_provider);
    crate::brain::api_provider_for_meeting_id(&registry).unwrap_or(registry)
}

/// Result of a live credential / connectivity check for the meeting brain.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderCredentialProbe {
    pub ok: bool,
    pub provider: String,
    pub has_credentials: bool,
    pub message: String,
}

fn probe_http_client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(15))
        .connect_timeout(Duration::from_secs(6))
        .build()
        .unwrap_or_else(|_| Client::new())
}

/// Live-test the selected meeting provider credentials (models list, or tiny chat fallback).
pub fn probe_provider_credentials(settings: &GameSettings, hub: &HubState) -> ProviderCredentialProbe {
    if settings.pure_local_mode {
        return ProviderCredentialProbe {
            ok: true,
            provider: "mock".to_string(),
            has_credentials: true,
            message: "Pure local mode — mock dialogue is ready (no cloud key required).".to_string(),
        };
    }

    let provider = configured_meeting_provider(settings);
    match provider.as_str() {
        "mock" => ProviderCredentialProbe {
            ok: true,
            provider: "mock".to_string(),
            has_credentials: true,
            message: "Mock meeting brain is ready.".to_string(),
        },
        "ollama" => {
            let ollama =
                OllamaProvider::new(settings.ollama_base_url.clone(), settings.ollama_model.clone());
            if ollama.is_reachable() {
                ProviderCredentialProbe {
                    ok: true,
                    provider: "ollama".to_string(),
                    has_credentials: true,
                    message: format!(
                        "Ollama reachable · model {} @ {}",
                        settings.ollama_model, settings.ollama_base_url
                    ),
                }
            } else {
                ProviderCredentialProbe {
                    ok: false,
                    provider: "ollama".to_string(),
                    has_credentials: false,
                    message: format!(
                        "Ollama unreachable at {} (is the server running?).",
                        settings.ollama_base_url
                    ),
                }
            }
        }
        "openai" => probe_openai_compatible(
            "openai",
            &settings.openai_base_url,
            &settings.openai_api_key,
            &settings.openai_model,
        ),
        "grok" => probe_openai_compatible(
            "grok",
            &settings.grok_base_url,
            &settings.grok_api_key,
            &settings.grok_model,
        ),
        "claude" => probe_openai_compatible(
            "claude",
            &settings.claude_base_url,
            &settings.claude_api_key,
            &settings.claude_model,
        ),
        "deepseek" => probe_openai_compatible(
            "deepseek",
            &settings.deepseek_base_url,
            &settings.deepseek_api_key,
            &settings.deepseek_model,
        ),
        "soulmd-hub" | "soulmd_hub" | "hub" => probe_hub_credentials(settings, hub),
        other => ProviderCredentialProbe {
            ok: false,
            provider: other.to_string(),
            has_credentials: false,
            message: format!("Unknown meeting provider '{other}'."),
        },
    }
}

/// Live-test soulmd-hub URL + API key (used by Cloud & hub Settings light).
pub fn probe_hub_credentials(settings: &GameSettings, hub: &HubState) -> ProviderCredentialProbe {
    if settings.pure_local_mode {
        return ProviderCredentialProbe {
            ok: true,
            provider: "soulmd-hub".to_string(),
            has_credentials: true,
            message: "Pure Local Mode — hub is intentionally offline.".to_string(),
        };
    }

    let has_key = hub
        .api_key
        .as_ref()
        .map(|k| !k.trim().is_empty())
        .unwrap_or(false);
    let base = hub.base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return ProviderCredentialProbe {
            ok: false,
            provider: "soulmd-hub".to_string(),
            has_credentials: false,
            message: "Hub base URL is empty.".to_string(),
        };
    }
    if !has_key {
        return ProviderCredentialProbe {
            ok: false,
            provider: "soulmd-hub".to_string(),
            has_credentials: false,
            message: "Hub API key is missing — paste a key and save.".to_string(),
        };
    }

    let client = probe_http_client();
    let url = format!("{base}/api/souls.php?limit=1");
    let api_key = hub.api_key.as_deref().unwrap_or("").trim();
    match client
        .get(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .send()
    {
        Ok(response) if response.status().is_success() => ProviderCredentialProbe {
            ok: true,
            provider: "soulmd-hub".to_string(),
            has_credentials: true,
            message: format!("soulmd-hub OK · key accepted @ {base}"),
        },
        Ok(response) => {
            let status = response.status();
            let body = response.text().unwrap_or_default();
            let snippet: String = body.chars().take(160).collect();
            ProviderCredentialProbe {
                ok: false,
                provider: "soulmd-hub".to_string(),
                has_credentials: true,
                message: format!("soulmd-hub failed ({status}): {snippet}"),
            }
        }
        Err(err) => ProviderCredentialProbe {
            ok: false,
            provider: "soulmd-hub".to_string(),
            has_credentials: true,
            message: format!("soulmd-hub network error: {err}"),
        },
    }
}

fn probe_openai_compatible(
    label: &str,
    base_url: &str,
    api_key: &str,
    model: &str,
) -> ProviderCredentialProbe {
    let has_key = !api_key.trim().is_empty();
    let has_model = !model.trim().is_empty();
    if !has_key {
        return ProviderCredentialProbe {
            ok: false,
            provider: label.to_string(),
            has_credentials: false,
            message: format!("{label}: API key is empty — paste a key and leave the field to save."),
        };
    }
    if !has_model {
        return ProviderCredentialProbe {
            ok: false,
            provider: label.to_string(),
            has_credentials: false,
            message: format!("{label}: model is empty — set a model id."),
        };
    }

    let base = base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return ProviderCredentialProbe {
            ok: false,
            provider: label.to_string(),
            has_credentials: true,
            message: format!("{label}: base URL is empty."),
        };
    }

    let client = probe_http_client();
    let models_url = format!("{base}/models");
    match client
        .get(&models_url)
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .send()
    {
        Ok(response) if response.status().is_success() => {
            return ProviderCredentialProbe {
                ok: true,
                provider: label.to_string(),
                has_credentials: true,
                message: format!("{label} OK · key accepted · model {model}"),
            };
        }
        Ok(response) if response.status().as_u16() == 401 || response.status().as_u16() == 403 => {
            let status = response.status();
            let body = response.text().unwrap_or_default();
            let snippet: String = body.chars().take(160).collect();
            return ProviderCredentialProbe {
                ok: false,
                provider: label.to_string(),
                has_credentials: true,
                message: format!("{label} rejected key ({status}): {snippet}"),
            };
        }
        Ok(_) | Err(_) => {
            // Some endpoints lack /models — fall through to a tiny chat probe.
        }
    }

    let chat_url = format!("{base}/chat/completions");
    let body = json!({
        "model": model,
        "temperature": 0.0,
        "max_tokens": 1,
        "messages": [
            {"role": "user", "content": "ping"}
        ],
    });
    match client
        .post(chat_url)
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .json(&body)
        .send()
    {
        Ok(response) if response.status().is_success() => ProviderCredentialProbe {
            ok: true,
            provider: label.to_string(),
            has_credentials: true,
            message: format!("{label} OK · chat probe succeeded · model {model}"),
        },
        Ok(response) => {
            let status = response.status();
            let body = response.text().unwrap_or_default();
            let snippet: String = body.chars().take(180).collect();
            ProviderCredentialProbe {
                ok: false,
                provider: label.to_string(),
                has_credentials: true,
                message: format!("{label} failed ({status}): {snippet}"),
            }
        }
        Err(err) => ProviderCredentialProbe {
            ok: false,
            provider: label.to_string(),
            has_credentials: true,
            message: format!("{label} network error: {err}"),
        },
    }
}

/// True when company cloud API key is present for the selected meeting provider.
/// Mock / pure local / ollama (local) do not require a stored cloud key.
pub fn company_llm_credentials_ready(settings: &GameSettings) -> bool {
    if settings.pure_local_mode {
        return true;
    }
    let provider = configured_meeting_provider(settings);
    match provider.as_str() {
        "mock" | "ollama" => true,
        "openai" => !settings.openai_api_key.trim().is_empty(),
        "grok" => !settings.grok_api_key.trim().is_empty(),
        "claude" => !settings.claude_api_key.trim().is_empty(),
        "deepseek" => !settings.deepseek_api_key.trim().is_empty(),
        // Hub chat key is on HubState — treat as ready if not pure-local; hub path probes separately.
        "soulmd-hub" | "soulmd_hub" | "hub" => true,
        _ => false,
    }
}

/// Auto worker should not run LLM-heavy automation until credentials are ready.
pub fn auto_work_should_run(settings: &GameSettings) -> bool {
    if settings.pure_local_mode || settings.ai_provider.trim().eq_ignore_ascii_case("mock") {
        return true;
    }
    company_llm_credentials_ready(settings)
}