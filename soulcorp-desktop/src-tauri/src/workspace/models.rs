use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceType {
    Company,
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
    pub linked_entities: Vec<LinkedEntity>,
    pub last_edited_at: String,
    pub last_edited_by: String,
    pub version: u32,
    pub dirty: bool,
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
pub struct UpdatePageRequest {
    pub page_id: String,
    pub title: Option<String>,
    pub blocks: Option<Vec<Block>>,
    pub last_edited_by: Option<String>,
}
