use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeProbe {
    pub runtime_id: String,
    pub runtime_label: String,
    pub adapter: String,
    pub binary_path: String,
    pub binary_available: bool,
    pub version: Option<String>,
    pub agent_command_available: bool,
    pub gateway_healthy: bool,
    pub message: String,
}

pub type ClawProbe = RuntimeProbe;
pub type OpenClawProbe = RuntimeProbe;

#[derive(Debug, Clone)]
pub struct RuntimeResult {
    pub content: String,
    pub transport: String,
    pub session_id: Option<String>,
    pub duration_ms: u64,
}

pub type ClawRunResult = RuntimeResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeCatalogEntry {
    pub id: String,
    pub label: String,
    pub category: String,
    pub adapter: String,
    pub default_binary: String,
    pub docs_url: String,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdapterCatalogEntry {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeCatalog {
    pub version: u32,
    pub adapters: Vec<AdapterCatalogEntry>,
    pub runtimes: Vec<RuntimeCatalogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeProbeSummary {
    pub runtime_id: String,
    pub runtime_label: String,
    pub category: String,
    pub binary_available: bool,
    pub message: String,
}