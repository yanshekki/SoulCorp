pub mod backfill;
pub mod emitter;
pub mod types;

pub use backfill::{backfill_if_needed, current_task_for_agent};
pub use emitter::{
    emit_deliverable_ready, emit_error, emit_step_complete, emit_step_start, emit_terminal_line,
    emit_token_delta, emit_worker_message, end_session, max_events, resolve_brain_labels,
    snapshot, start_session,
};
pub use types::{
    ActivityKind, ActivityRunContext, ActivitySource, AgentActivityEvent, AgentActivityPayload,
    AgentActivitySession, AgentActivitySnapshot, AgentActivityStore, BrainLayer, EVENT_NAME,
    NewSessionParams, SessionStatus,
};