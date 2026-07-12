use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkNodeKind {
    Program,
    Epic,
    Story,
    Task,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkNodeStatus {
    Backlog,
    Ready,
    InSprint,
    InProgress,
    InReview,
    Done,
    Blocked,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SprintStatus {
    Planning,
    Active,
    Review,
    Closed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DirectiveSource {
    Ceo,
    Meeting,
    CoCeo,
    Marketplace,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DirectiveTarget {
    Department,
    Agent,
    Project,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DirectiveStatus {
    Open,
    Routed,
    Executing,
    Done,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Throttled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkNode {
    pub id: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    pub project_id: String,
    pub kind: WorkNodeKind,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub status: WorkNodeStatus,
    #[serde(default = "default_priority")]
    pub priority: u8,
    #[serde(default)]
    pub story_points: u8,
    #[serde(default)]
    pub backlog_rank: u32,
    #[serde(default)]
    pub assignee_agent_id: Option<String>,
    #[serde(default)]
    pub assigned_by_manager_id: Option<String>,
    #[serde(default)]
    pub owner_pm_agent_id: Option<String>,
    #[serde(default)]
    pub retry_count: u8,
    #[serde(default)]
    pub department: String,
    #[serde(default)]
    pub sprint_id: Option<String>,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub acceptance_criteria: Vec<String>,
    #[serde(default)]
    pub linked_workspace_page_id: Option<String>,
    #[serde(default)]
    pub linked_gig_contract_id: Option<String>,
    #[serde(default)]
    pub awaiting_ceo_gate: bool,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub completed_at: Option<String>,
    /// When this task entered the assignee's serial queue (Kafka-like partition).
    #[serde(default)]
    pub queued_at: Option<String>,
}

fn default_priority() -> u8 {
    3
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sprint {
    pub id: String,
    pub project_id: String,
    pub name: String,
    #[serde(default)]
    pub goal: String,
    #[serde(default = "default_cycle_days")]
    pub cycle_length_days: u32,
    #[serde(default = "default_one")]
    pub start_day: u32,
    #[serde(default = "default_cycle_days")]
    pub end_day: u32,
    pub status: SprintStatus,
    #[serde(default)]
    pub committed_story_ids: Vec<String>,
    #[serde(default = "default_velocity")]
    pub velocity_target: u8,
    #[serde(default)]
    pub started_at: Option<String>,
}

fn default_cycle_days() -> u32 {
    14
}

fn default_one() -> u32 {
    1
}

fn default_velocity() -> u8 {
    21
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Directive {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub source: DirectiveSource,
    pub target: DirectiveTarget,
    pub target_ref: String,
    pub status: DirectiveStatus,
    #[serde(default)]
    pub spawned_node_ids: Vec<String>,
    #[serde(default)]
    pub awaiting_ceo_gate: bool,
    #[serde(default)]
    pub ceo_comment: String,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionWorkspacePagePath {
    pub title: String,
    pub page_id: String,
    pub md_path: String,
}

/// Absolute + logical paths so UI and Grok both know where agent notes live.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExecutionWorkspaceInfo {
    #[serde(default)]
    pub company_id: String,
    #[serde(default)]
    pub company_workspace_root: String,
    #[serde(default)]
    pub agent_folder_id: String,
    #[serde(default)]
    pub agent_folder_name: String,
    #[serde(default)]
    pub agent_memory_page_id: Option<String>,
    #[serde(default)]
    pub agent_memory_md_path: Option<String>,
    #[serde(default)]
    pub page_paths: Vec<ExecutionWorkspacePagePath>,
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub access_notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionRun {
    pub id: String,
    pub work_node_id: String,
    pub agent_id: String,
    pub status: ExecutionStatus,
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub estimated_tokens: u64,
    #[serde(default)]
    pub actual_tokens: u64,
    #[serde(default)]
    pub deliverable_page_id: Option<String>,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub started_at: String,
    #[serde(default)]
    pub finished_at: Option<String>,
    /// Full prompt body (also written to a temp file for subprocess CLIs).
    #[serde(default)]
    pub cli_input: Option<String>,
    /// Human-readable command line using --prompt-file / --message-file (no full body in argv).
    #[serde(default)]
    pub cli_command: Option<String>,
    /// Absolute path of the materialized prompt file (if subprocess used a temp file).
    #[serde(default)]
    pub cli_prompt_path: Option<String>,
    /// Workspace dual-addressing (logical folder + absolute paths).
    #[serde(default)]
    pub workspace_info: Option<ExecutionWorkspaceInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkTreeNode {
    pub node: WorkNode,
    pub children: Vec<WorkTreeNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkTreeSnapshot {
    pub project_id: String,
    pub nodes: Vec<WorkTreeNode>,
    pub flat: Vec<WorkNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrumBoardSnapshot {
    pub project_id: String,
    pub active_sprint: Option<Sprint>,
    pub backlog: Vec<WorkNode>,
    pub sprint_items: Vec<WorkNode>,
    pub in_progress: Vec<WorkNode>,
    pub in_review: Vec<WorkNode>,
    pub done: Vec<WorkNode>,
    pub burndown_remaining: u32,
    pub burndown_total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInboxEntry {
    pub agent_id: String,
    pub agent_name: String,
    pub agent_role: String,
    pub department: String,
    pub assigned_points: u32,
    pub tasks: Vec<WorkNode>,
    /// Ready/InSprint tasks waiting in this agent's serial queue.
    #[serde(default)]
    pub queued_count: u32,
    /// True when the agent has an InProgress task.
    #[serde(default)]
    pub busy: bool,
}