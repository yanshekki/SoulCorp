mod commands;
mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            db::init_database(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_local_agent,
            commands::run_simulation_tick,
            commands::get_local_queue_status,
            commands::sync_with_hub,
            commands::sign_near_transaction,
            commands::submit_gig_to_hub,
            db::get_app_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
