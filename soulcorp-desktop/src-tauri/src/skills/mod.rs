//! Agent Skills catalog (OpenClaw / Hermes–style SKILL.md packs).

pub mod adapters;
pub mod catalog;
pub mod custom;
pub mod dispatcher;
pub mod protocol;
pub mod runtimes;
pub mod security;
pub mod starter_skills;
pub mod types;

pub use catalog::{
    builtin_catalog, catalog_view, catalog_view_with_packs, enabled_packs, full_catalog, get_pack,
    get_pack_from, parse_skill_md,
};
pub use dispatcher::{dispatch_tool, dispatch_tool_with_context};
pub use protocol::{format_skill_catalog_prompt, parse_agent_tool_message};
pub use security::{audit_snapshot, clear_audit, FirewallDecision, FirewallEvent, SkillPolicy};
pub use types::*;
