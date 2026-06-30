use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};

static TICK_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Serialize, Deserialize)]
pub struct SimulationTickResult {
    pub tick: u64,
    pub agents_active: u32,
    pub message: String,
}

#[tauri::command]
pub fn run_simulation_tick() -> Result<SimulationTickResult, String> {
    let tick = TICK_COUNTER.fetch_add(1, Ordering::SeqCst) + 1;

    Ok(SimulationTickResult {
        tick,
        agents_active: 3,
        message: format!("Simulation tick {tick}: agents are moving through the office."),
    })
}
