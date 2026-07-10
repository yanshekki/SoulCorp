use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskTier {
    Low,
    Medium,
    High,
    Critical,
}

impl RiskTier {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Critical => "critical",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_lowercase().as_str() {
            "low" => Some(Self::Low),
            "medium" | "med" => Some(Self::Medium),
            "high" => Some(Self::High),
            "critical" | "crit" => Some(Self::Critical),
            _ => None,
        }
    }

    pub fn rank(self) -> u8 {
        match self {
            Self::Low => 0,
            Self::Medium => 1,
            Self::High => 2,
            Self::Critical => 3,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TokenCostClass {
    Light,
    Medium,
    Heavy,
}

impl TokenCostClass {
    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_lowercase().as_str() {
            "heavy" => Self::Heavy,
            "medium" | "med" => Self::Medium,
            _ => Self::Light,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolParameterSpec {
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSpec {
    pub id: String,
    pub description: String,
    #[serde(default)]
    pub parameters: Vec<ToolParameterSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillPack {
    pub id: String,
    pub name: String,
    pub version: u32,
    pub category: String,
    pub risk: RiskTier,
    pub requires_approval: bool,
    pub token_cost_class: TokenCostClass,
    pub permissions: Vec<String>,
    pub tools: Vec<ToolSpec>,
    pub when_to_use: String,
    /// Full markdown body after frontmatter (progressive disclosure).
    pub body: String,
    pub source: SkillSource,
    /// Optional script entry relative to pack root (custom script skills).
    #[serde(default)]
    pub entry: Option<String>,
    /// Optional runtime: sh | php | node | python | rust
    #[serde(default)]
    pub runtime: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillSource {
    Builtin,
    Company,
    Global,
}

/// Compact card for LLM catalog / UI lists (no full body).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillSummary {
    pub id: String,
    pub name: String,
    pub category: String,
    pub risk: RiskTier,
    pub requires_approval: bool,
    pub token_cost_class: TokenCostClass,
    pub when_to_use: String,
    pub tool_ids: Vec<String>,
    pub enabled: bool,
    pub source: SkillSource,
    #[serde(default)]
    pub entry: Option<String>,
    #[serde(default)]
    pub runtime: Option<String>,
}

impl SkillPack {
    pub fn summary(&self, enabled: bool) -> SkillSummary {
        SkillSummary {
            id: self.id.clone(),
            name: self.name.clone(),
            category: self.category.clone(),
            risk: self.risk,
            requires_approval: self.requires_approval,
            token_cost_class: self.token_cost_class,
            when_to_use: self.when_to_use.clone(),
            tool_ids: self.tools.iter().map(|t| t.id.clone()).collect(),
            enabled,
            source: self.source,
            entry: self.entry.clone(),
            runtime: self.runtime.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillCatalogView {
    pub version: u32,
    pub packs: Vec<SkillSummary>,
    pub by_category: BTreeMap<String, Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentToolMessage {
    ToolCall {
        tool: String,
        #[serde(default)]
        args: serde_json::Value,
    },
    Final {
        content: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDispatchRequest {
    pub tool: String,
    #[serde(default)]
    pub args: serde_json::Value,
    #[serde(default)]
    pub dry_run: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDispatchResult {
    pub tool: String,
    pub ok: bool,
    pub message: String,
    #[serde(default)]
    pub data: serde_json::Value,
    pub dry_run: bool,
}
