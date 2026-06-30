use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Smoke3dReport {
    pub webgl_ok: bool,
    pub webgl_version: Option<String>,
    pub render_status: String,
    pub mode: String,
    pub non_black_ratio: f64,
    pub average_luminance: f64,
    pub canvas_width: u32,
    pub canvas_height: u32,
    pub error: Option<String>,
}

fn smoke_output_path() -> PathBuf {
    std::env::var("SOULCORP_3D_SMOKE_OUTPUT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp/soulcorp-3d-smoke.json"))
}

#[tauri::command]
pub fn is_3d_smoke_test_enabled() -> bool {
    smoke_test_enabled_from_env()
}

pub fn smoke_test_enabled_from_env() -> bool {
    std::env::var("SOULCORP_3D_SMOKE")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

#[tauri::command]
pub fn write_3d_smoke_report(report: Smoke3dReport) -> Result<String, String> {
    let path = smoke_output_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let json = serde_json::to_string_pretty(&report).map_err(|error| error.to_string())?;
    fs::write(&path, json).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn exit_3d_smoke_test(exit_code: i32, app: AppHandle) {
    app.exit(exit_code);
}

pub fn spawn_smoke_watchdog(app: AppHandle) {
    if !smoke_test_enabled_from_env() {
        return;
    }

    thread::spawn(move || {
        thread::sleep(Duration::from_secs(75));
        let path = smoke_output_path();
        if path.exists() {
            return;
        }

        let report = Smoke3dReport {
            webgl_ok: false,
            webgl_version: None,
            render_status: "timeout".to_string(),
            mode: "unknown".to_string(),
            non_black_ratio: 0.0,
            average_luminance: 0.0,
            canvas_width: 0,
            canvas_height: 0,
            error: Some(
                "Smoke watchdog timeout: frontend did not submit a 3D render report.".to_string(),
            ),
        };

        if let Ok(json) = serde_json::to_string_pretty(&report) {
            let _ = fs::write(&path, json);
        }
        app.exit(1);
    });
}