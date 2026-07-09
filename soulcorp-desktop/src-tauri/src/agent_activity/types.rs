use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const EVENT_NAME: &str = "agent-activity";
pub const DEFAULT_MAX_EVENTS: usize = 500;
pub const DEFAULT_MAX_SESSIONS: usize = 50;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActivitySource {
    Execution,
    Meeting,
    Workspace,
    Worker,
    Orchestrator,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BrainLayer {
    Meeting,
    Execution,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Active,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActivityKind {
    SessionStart,
    SessionEnd,
    StatusChange,
    StepStart,
    StepComplete,
    TokenDelta,
    TerminalLine,
    ToolAction,
    WorkAssigned,
    DeliverableReady,
    Error,
    AutopilotPhaseChange,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentActivitySession {
    pub id: String,
    pub agent_id: String,
    pub agent_name: String,
    pub source: ActivitySource,
    pub brain_layer: BrainLayer,
    pub brain_label: String,
    pub transport: String,
    #[serde(default)]
    pub work_node_id: Option<String>,
    #[serde(default)]
    pub work_node_title: Option<String>,
    #[serde(default)]
    pub meeting_id: Option<String>,
    #[serde(default)]
    pub run_id: Option<String>,
    pub status: SessionStatus,
    pub started_at: String,
    #[serde(default)]
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentActivityEvent {
    pub id: String,
    pub session_id: String,
    pub agent_id: String,
    pub kind: ActivityKind,
    pub timestamp: String,
    #[serde(default)]
    pub step: Option<String>,
    #[serde(default)]
    pub content_delta: Option<String>,
    #[serde(default)]
    pub content_full: Option<String>,
    #[serde(default)]
    pub metadata: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentActivityPayload {
    pub event: AgentActivityEvent,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<AgentActivitySession>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentActivityStore {
    #[serde(default)]
    pub sessions: Vec<AgentActivitySession>,
    #[serde(default)]
    pub events: Vec<AgentActivityEvent>,
    #[serde(default)]
    pub backfill_done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentActivitySnapshot {
    pub sessions: Vec<AgentActivitySession>,
    pub events: Vec<AgentActivityEvent>,
}

#[derive(Debug, Clone)]
pub struct ActivityRunContext {
    pub session_id: String,
    pub app: tauri::AppHandle,
}

#[derive(Debug, Clone)]
pub struct NewSessionParams {
    pub agent_id: String,
    pub agent_name: String,
    pub source: ActivitySource,
    pub brain_layer: BrainLayer,
    pub brain_label: String,
    pub transport: String,
    pub work_node_id: Option<String>,
    pub work_node_title: Option<String>,
    pub meeting_id: Option<String>,
    pub run_id: Option<String>,
}