mod achievements;
mod ai;
mod commands;
mod db;
mod finance;
mod hub;
mod report;
mod soul;
mod state;
mod tier;
mod workspace;

use achievements::{default_achievements, default_endings};
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            db::init_database(app.handle())?;
            let mut state = db::persistence::load_app_state(app.handle())?.unwrap_or_default();
            if state.agents.is_empty() {
                state.seed_defaults();
            } else if state.projects.is_empty() {
                state.seed_projects();
            }
            if state.achievements.is_empty() {
                state.achievements = default_achievements();
            }
            if state.endings.is_empty() {
                state.endings = default_endings();
            }
            app.manage(Mutex::new(state));
            commands::spawn_smoke_watchdog(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_local_agent,
            commands::load_agent_soul,
            commands::list_agents,
            commands::run_simulation_tick,
            commands::get_simulation_snapshot,
            commands::get_local_queue_status,
            commands::get_hub_status,
            commands::update_hub_config,
            commands::list_hub_gigs,
            commands::create_hub_gig,
            commands::sync_with_hub,
            commands::fetch_soul_balance,
            commands::get_tier_benefits,
            commands::check_feature_access,
            commands::upgrade_tier,
            commands::sign_near_transaction,
            commands::get_near_upgrade_config,
            commands::open_hub_upgrade_page,
            commands::claim_near_tier_upgrade,
            commands::get_game_settings,
            commands::update_game_settings,
            commands::get_finance_state,
            commands::list_internal_projects,
            commands::update_budget_allocations,
            commands::adjust_agent_salary,
            commands::list_recruitment_candidates,
            commands::hire_candidate,
            commands::import_company_backup,
            commands::get_recent_events,
            commands::start_meeting,
            commands::advance_meeting,
            commands::god_mode_time_warp,
            commands::god_mode_mass_motivation,
            commands::god_mode_emergency_budget,
            commands::god_mode_divine_inspiration,
            commands::god_mode_black_swan,
            commands::god_mode_agent_mutation,
            commands::god_mode_reality_edit,
            commands::god_mode_perfect_hiring,
            commands::god_mode_total_chaos,
            commands::god_mode_reset_agent_memory,
            commands::god_mode_force_relationship,
            commands::get_god_mode_history,
            commands::init_workspace,
            commands::list_workspace_tree,
            commands::get_workspace_page,
            commands::create_workspace_page,
            commands::update_workspace_page,
            commands::search_workspace,
            commands::list_linkable_entities,
            commands::link_workspace_entity,
            commands::unlink_workspace_entity,
            commands::find_workspace_backlinks,
            commands::generate_meeting_notes,
            commands::get_achievements,
            commands::export_company_backup,
            commands::export_company_report_markdown,
            commands::export_company_report_html,
            commands::export_company_report_pdf,
            commands::open_exports_folder,
            commands::export_workspace_markdown_zip,
            commands::is_3d_smoke_test_enabled,
            commands::write_3d_smoke_report,
            commands::exit_3d_smoke_test,
            db::get_app_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
