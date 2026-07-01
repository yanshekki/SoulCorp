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
    pub last_edited_at: String,
    pub last_edited_by: String,
    pub version: u32,
    pub dirty: bool,
    #[serde(default)]
    pub sort_order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceTree {
    pub folders: Vec<WorkspaceFolder>,
    pub pages: Vec<WorkspacePageSummary>,
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
