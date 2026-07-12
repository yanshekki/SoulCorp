use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogLevel {
    Error,
    Warn,
    Info,
}

impl LogLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            LogLevel::Error => "error",
            LogLevel::Warn => "warn",
            LogLevel::Info => "info",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "error" => Some(LogLevel::Error),
            "warn" | "warning" => Some(LogLevel::Warn),
            "info" => Some(LogLevel::Info),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogCategory {
    Meeting,
    Execution,
    Worker,
    Ai,
    Hub,
    Workspace,
    Settings,
    Finance,
    System,
    Ui,
}

impl LogCategory {
    pub fn as_str(self) -> &'static str {
        match self {
            LogCategory::Meeting => "meeting",
            LogCategory::Execution => "execution",
            LogCategory::Worker => "worker",
            LogCategory::Ai => "ai",
            LogCategory::Hub => "hub",
            LogCategory::Workspace => "workspace",
            LogCategory::Settings => "settings",
            LogCategory::Finance => "finance",
            LogCategory::System => "system",
            LogCategory::Ui => "ui",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "meeting" => Some(LogCategory::Meeting),
            "execution" => Some(LogCategory::Execution),
            "worker" => Some(LogCategory::Worker),
            "ai" => Some(LogCategory::Ai),
            "hub" => Some(LogCategory::Hub),
            "workspace" => Some(LogCategory::Workspace),
            "settings" => Some(LogCategory::Settings),
            "finance" => Some(LogCategory::Finance),
            "system" => Some(LogCategory::System),
            "ui" => Some(LogCategory::Ui),
            _ => None,
        }
    }

    pub fn all() -> &'static [LogCategory] {
        &[
            LogCategory::Meeting,
            LogCategory::Execution,
            LogCategory::Worker,
            LogCategory::Ai,
            LogCategory::Hub,
            LogCategory::Workspace,
            LogCategory::Settings,
            LogCategory::Finance,
            LogCategory::System,
            LogCategory::Ui,
        ]
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppLogEntry {
    pub id: String,
    pub created_at: String,
    pub level: String,
    pub category: String,
    pub source: String,
    pub message: String,
    #[serde(default)]
    pub detail: Option<String>,
    #[serde(default)]
    pub company_id: Option<String>,
    #[serde(default)]
    pub meta: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppLogQuery {
    #[serde(default)]
    pub q: Option<String>,
    #[serde(default)]
    pub level: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub company_id: Option<String>,
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
    #[serde(default)]
    pub limit: Option<u32>,
    #[serde(default)]
    pub offset: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppLogPage {
    pub items: Vec<AppLogEntry>,
    pub total: u32,
    pub limit: u32,
    pub offset: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppLogStats {
    pub total: u32,
    pub error: u32,
    pub warn: u32,
    pub info: u32,
    pub by_category: Vec<CategoryCount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryCount {
    pub category: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppendAppLogRequest {
    pub level: String,
    pub category: String,
    pub source: String,
    pub message: String,
    #[serde(default)]
    pub detail: Option<String>,
    #[serde(default)]
    pub company_id: Option<String>,
    #[serde(default)]
    pub meta: Option<Value>,
}
