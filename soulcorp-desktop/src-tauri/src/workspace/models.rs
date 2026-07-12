use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceType {
    Company,
    Department,
    Agent,
    User,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Permission {
    pub subject_id: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceFolder {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub parent_id: Option<String>,
    pub workspace_type: WorkspaceType,
    pub owner_id: String,
    pub is_private: bool,
    pub permissions: Vec<Permission>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub sort_order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub id: String,
    #[serde(rename = "type")]
    pub block_type: String,
    pub content: String,
    pub checked: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkedEntity {
    pub entity_type: String,
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspacePage {
    pub id: String,
    pub title: String,
    pub folder_id: String,
    pub icon: Option<String>,
    pub blocks: Vec<Block>,
    #[serde(default)]
    pub rich_doc: Option<serde_json::Value>,
    #[serde(default)]
    pub linked_entities: Vec<LinkedEntity>,
    /// Older page JSON on disk may omit these — default so journal/CLI context never hard-fails.
    #[serde(default)]
    pub last_edited_at: String,
    #[serde(default)]
    pub last_edited_by: String,
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub dirty: bool,
    #[serde(default)]
    pub sort_order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceFileKind {
    Image,
    Document,
    Pdf,
    Spreadsheet,
    Presentation,
    Archive,
    Video,
    Audio,
    Text,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceFile {
    pub id: String,
    pub folder_id: String,
    pub name: String,
    pub extension: String,
    pub mime_type: String,
    pub file_kind: WorkspaceFileKind,
    pub size_bytes: u64,
    pub uploaded_at: String,
    pub uploaded_by: String,
    #[serde(default)]
    pub sort_order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceFileSummary {
    pub id: String,
    pub folder_id: String,
    pub name: String,
    pub extension: String,
    pub mime_type: String,
    pub file_kind: WorkspaceFileKind,
    pub size_bytes: u64,
    pub uploaded_at: String,
    pub uploaded_by: String,
    #[serde(default)]
    pub sort_order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceTree {
    pub folders: Vec<WorkspaceFolder>,
    pub pages: Vec<WorkspacePageSummary>,
    #[serde(default)]
    pub files: Vec<WorkspaceFileSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSnapshot {
    pub folders: Vec<WorkspaceFolder>,
    pub page_count: u32,
    pub file_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceFolderChildren {
    pub folder_id: String,
    pub pages: Vec<WorkspacePageSummary>,
    pub files: Vec<WorkspaceFileSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSummaries {
    pub pages: Vec<WorkspacePageSummary>,
    pub files: Vec<WorkspaceFileSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolveWorkspaceItemsRequest {
    pub item_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspacePageSummary {
    pub id: String,
    pub title: String,
    pub folder_id: String,
    pub last_edited_at: String,
    pub last_edited_by: String,
    #[serde(default)]
    pub sort_order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReorderWorkspacePagesRequest {
    pub folder_id: String,
    pub page_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReorderWorkspaceItemsRequest {
    pub folder_id: String,
    pub item_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportWorkspaceFilesRequest {
    pub folder_id: String,
    pub source_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteWorkspaceFileRequest {
    pub file_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceFilePathResponse {
    pub file_id: String,
    pub absolute_path: String,
    pub mime_type: String,
    pub file_kind: WorkspaceFileKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub page_id: String,
    pub title: String,
    pub folder_id: String,
    pub snippet: String,
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePageRequest {
    pub folder_id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateFolderRequest {
    pub parent_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeletePageRequest {
    pub page_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteFolderRequest {
    pub folder_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatePageRequest {
    pub page_id: String,
    pub title: Option<String>,
    pub blocks: Option<Vec<Block>>,
    pub rich_doc: Option<serde_json::Value>,
    pub linked_entities: Option<Vec<LinkedEntity>>,
    pub last_edited_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkEntityRequest {
    pub page_id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnlinkEntityRequest {
    pub page_id: String,
    pub entity_type: String,
    pub entity_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkableEntity {
    pub entity_type: String,
    pub id: String,
    pub title: String,
    pub subtitle: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageBacklink {
    pub page_id: String,
    pub title: String,
    pub folder_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePageFromTemplateRequest {
    pub folder_id: String,
    pub template_id: String,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageVersionSummary {
    pub version: u32,
    pub saved_at: String,
    pub editor: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestorePageVersionRequest {
    pub page_id: String,
    pub version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageComment {
    pub id: String,
    pub page_id: String,
    pub author: String,
    pub content: String,
    pub mentions: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddPageCommentRequest {
    pub page_id: String,
    pub author: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceDatabaseView {
    pub id: String,
    pub title: String,
    pub description: String,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspacePresenceEntry {
    pub page_id: String,
    pub editor: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentWorkspaceReadPageRequest {
    pub agent_id: String,
    pub page_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentWorkspaceSearchRequest {
    pub agent_id: String,
    pub query: String,
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentWorkspaceCreatePageRequest {
    pub agent_id: String,
    pub title: String,
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentWorkspaceAppendRequest {
    pub agent_id: String,
    pub page_id: String,
    pub heading: String,
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentWorkspaceJournalRequest {
    pub agent_id: String,
    pub journal_title: String,
    pub heading: String,
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentWorkspaceDeliverableRequest {
    pub agent_id: String,
    pub title: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentWorkspacePageView {
    pub page_id: String,
    pub title: String,
    pub folder_id: String,
    pub text: String,
    pub last_edited_at: String,
    pub last_edited_by: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentWorkspaceActivityEntry {
    pub agent_id: String,
    pub agent_name: String,
    pub page_id: String,
    pub title: String,
    pub folder_id: String,
    pub last_edited_at: String,
    pub action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentWorkspaceContext {
    pub agent_id: String,
    pub agent_name: String,
    pub folder_id: String,
    pub pages: Vec<WorkspacePageSummary>,
    #[serde(default)]
    pub files: Vec<WorkspaceFileSummary>,
    pub recent_edits: Vec<AgentWorkspaceActivityEntry>,
}
