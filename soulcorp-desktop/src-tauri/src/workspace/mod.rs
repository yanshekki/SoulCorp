pub mod activity_docs;
pub mod agent_memory;
pub mod agent_service;
pub mod cache;
pub mod file_catalog;
pub mod index;
pub mod models;
pub mod storage;
pub mod templates;

pub use activity_docs::{
    write_daily_activity_docs, write_event_activity_doc, write_meeting_notes_from_state,
    ActivitySnapshot,
};
pub use agent_service::{format_workspace_context_for_prompt, page_to_text, AgentContext, AgentWorkspaceService};
pub use models::*;
pub use storage::{company_workspace_root, WorkspaceStorage};
pub use templates::{create_page_from_template, list_templates};
