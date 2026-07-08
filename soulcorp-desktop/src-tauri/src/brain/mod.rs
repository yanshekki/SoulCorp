pub mod resolver;

pub use resolver::PROVIDER_DEFAULT;
pub use resolver::{
    api_provider_for_meeting_id, effective_execution_label, effective_meeting_label,
    legacy_meeting_provider_to_registry_id, normalize_execution_override,
    normalize_meeting_override, resolve_execution_runtime, resolve_meeting_provider,
    resolve_meeting_registry_id, supported_meeting_provider_ids, BrainLayer,
};