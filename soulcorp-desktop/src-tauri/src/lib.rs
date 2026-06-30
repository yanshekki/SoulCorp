mod achievements;
mod ai;
mod commands;
mod db;
mod soul;
mod state;
mod workspace;

use state::AppState;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Mutex::new({
        let mut state = AppState::default();
        state.seed_defaults();
        state
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .setup(|app| {
            db::init_database(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_local_agent,
            commands::load_agent_soul,
            commands::list_agents,
            commands::run_simulation_tick,
            commands::get_simulation_snapshot,
            commands::get_local_queue_status,
            commands::sync_with_hub,
            commands::sign_near_transaction,
            commands::submit_gig_to_hub,
            commands::get_game_settings,
            commands::update_game_settings,
            commands::get_finance_state,
            commands::get_recent_events,
            commands::start_meeting,
            commands::advance_meeting,
            commands::god_mode_time_warp,
            commands::god_mode_mass_motivation,
            commands::god_mode_emergency_budget,
            commands::init_workspace,
            commands::list_workspace_tree,
            commands::get_workspace_page,
            commands::create_workspace_page,
            commands::update_workspace_page,
            commands::search_workspace,
            commands::generate_meeting_notes,
            commands::get_achievements,
            commands::export_company_backup,
            commands::export_workspace_markdown_zip,
            db::get_app_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
