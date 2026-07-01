mod achievements;
mod ai;
mod commands;
mod db;
mod finance;
mod gigs;
mod hub;
mod relationships;
mod report;
mod soul;
mod state;
mod static_site;
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
            let (_registry, mut state) = db::persistence::bootstrap_companies(app.handle())?;
            if state.onboarding_completed && state.agents.is_empty() {
                state.seed_defaults();
            } else if state.agents.is_empty() {
                // Wait for first-launch onboarding before seeding starter agents.
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
            commands::update_agent_ai_provider,
            commands::list_agents,
            commands::run_simulation_tick,
            commands::get_simulation_snapshot,
            commands::get_local_queue_status,
            commands::get_hub_status,
            commands::update_hub_config,
            commands::list_hub_gigs,
            commands::create_hub_gig,
            commands::list_gig_contracts,
            commands::accept_hub_gig,
            commands::start_gig_work,
            commands::submit_gig_for_qc,
            commands::complete_hub_gig,
            commands::reject_gig_qc,
            commands::dispute_hub_gig,
            commands::sync_with_hub,
            commands::fetch_soul_balance,
            commands::get_tier_benefits,
            commands::check_feature_access,
            commands::upgrade_tier,
            commands::sign_near_transaction,
            commands::get_near_upgrade_config,
            commands::open_hub_upgrade_page,
            commands::claim_near_tier_upgrade,
            commands::list_company_departments,
            commands::update_department_ai_provider,
            commands::create_custom_department,
            commands::delete_custom_department,
            commands::assign_agent_department,
            commands::get_co_ceo_status,
            commands::spawn_co_ceo,
            commands::run_co_ceo_briefing,
            commands::apply_co_ceo_directive,
            commands::set_co_ceo_autonomy,
            commands::get_game_settings,
            commands::update_game_settings,
            commands::get_onboarding_state,
            commands::complete_onboarding,
            commands::list_companies,
            commands::create_company,
            commands::switch_company,
            commands::delete_company,
            commands::get_visual_design,
            commands::save_visual_design,
            commands::update_building_visual,
            commands::update_office_visual,
            commands::update_agent_visual,
            commands::update_campus_theme,
            commands::apply_design_preset,
            commands::clear_all_test_data,
            commands::seed_fake_test_data,
            commands::get_finance_state,
            commands::list_internal_projects,
            commands::update_budget_allocations,
            commands::adjust_agent_salary,
            commands::list_recruitment_candidates,
            commands::get_agent_relationship_graph,
            commands::get_recruitment_analytics,
            commands::record_recruitment_interview,
            commands::hire_candidate,
            commands::import_company_backup,
            commands::get_recent_events,
            commands::get_event_foresight,
            commands::get_morale_heatmap,
            commands::get_meeting_ai_status,
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
            commands::get_god_mode_status,
            commands::init_workspace,
            commands::list_workspace_tree,
            commands::get_workspace_page,
            commands::create_workspace_page,
            commands::create_workspace_folder,
            commands::delete_workspace_page,
            commands::delete_workspace_folder,
            commands::reorder_workspace_pages,
            commands::update_workspace_page,
            commands::search_workspace,
            commands::list_linkable_entities,
            commands::link_workspace_entity,
            commands::unlink_workspace_entity,
            commands::find_workspace_backlinks,
            commands::generate_meeting_notes,
            commands::list_workspace_templates,
            commands::create_page_from_template_cmd,
            commands::list_page_versions,
            commands::restore_page_version,
            commands::list_page_comments,
            commands::add_page_comment,
            commands::set_workspace_presence,
            commands::get_workspace_presence,
            commands::clear_workspace_presence,
            commands::get_workspace_database,
            commands::get_achievements,
            commands::export_company_backup,
            commands::export_company_report_markdown,
            commands::export_company_report_html,
            commands::export_company_report_pdf,
            commands::open_exports_folder,
            commands::export_workspace_markdown_zip,
            commands::export_static_site_zip,
            commands::export_qc_rated_deliverables_zip,
            commands::get_deploy_status,
            commands::push_static_site_to_github,
            commands::push_static_site_to_vercel,
            commands::push_static_site_to_netlify,
            commands::is_3d_smoke_test_enabled,
            commands::write_3d_smoke_report,
            commands::exit_3d_smoke_test,
            db::get_app_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
