mod minutes;
mod runner;

pub use minutes::{
    build_minutes_heuristic, extract_action_items, polish_minutes_detached, MeetingMinutes,
};
pub use runner::run_automated_meeting;