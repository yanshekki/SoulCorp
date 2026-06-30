use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SimulationTickResult {
    pub tick: u64,
    pub agents_active: u32,
    pub message: String,
}

#[tauri::command]
pub fn run_simulation_tick() -> Result<SimulationTickResult, String> {
    Ok(SimulationTickResult {
        tick: 1,
        agents_active: 0,
        message: "Simulation tick placeholder (Phase 0)".to_string(),
    })
}
