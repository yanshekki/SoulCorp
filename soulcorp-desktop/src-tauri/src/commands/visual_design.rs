use crate::db::persistence::commit;
use crate::state::visual_design::{
    AgentVisualConfig, BuildingVisualConfig, CampusThemeConfig, CompanyVisualDesign,
    OfficeVisualConfig,
};
use crate::state::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisualDesignSnapshot {
    pub design: CompanyVisualDesign,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateBuildingVisualRequest {
    pub building_id: String,
    pub config: BuildingVisualConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateOfficeVisualRequest {
    pub building_id: String,
    pub config: OfficeVisualConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAgentVisualRequest {
    pub agent_id: String,
    pub config: AgentVisualConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyDesignPresetRequest {
    pub preset_id: String,
}

fn touch_design(state: &mut AppState) {
    state.visual_design.updated_at = Some(Utc::now().to_rfc3339());
}

#[tauri::command]
pub fn get_visual_design(state: State<'_, Mutex<AppState>>) -> Result<VisualDesignSnapshot, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(VisualDesignSnapshot {
        design: state.visual_design.clone(),
    })
}

#[tauri::command]
pub fn save_visual_design(
    design: CompanyVisualDesign,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<VisualDesignSnapshot, String> {
    let mut state = app_state.lock().map_err(|e| e.to_string())?;
    state.visual_design = design;
    touch_design(&mut state);
    let snapshot = VisualDesignSnapshot {
        design: state.visual_design.clone(),
    };
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn update_building_visual(
    request: UpdateBuildingVisualRequest,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<VisualDesignSnapshot, String> {
    let mut state = app_state.lock().map_err(|e| e.to_string())?;
    state
        .visual_design
        .buildings
        .insert(request.building_id, request.config);
    touch_design(&mut state);
    let snapshot = VisualDesignSnapshot {
        design: state.visual_design.clone(),
    };
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn update_office_visual(
    request: UpdateOfficeVisualRequest,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<VisualDesignSnapshot, String> {
    let mut state = app_state.lock().map_err(|e| e.to_string())?;
    state
        .visual_design
        .offices
        .insert(request.building_id, request.config);
    touch_design(&mut state);
    let snapshot = VisualDesignSnapshot {
        design: state.visual_design.clone(),
    };
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn update_agent_visual(
    request: UpdateAgentVisualRequest,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<VisualDesignSnapshot, String> {
    let mut state = app_state.lock().map_err(|e| e.to_string())?;
    state
        .visual_design
        .agents
        .insert(request.agent_id, request.config);
    touch_design(&mut state);
    let snapshot = VisualDesignSnapshot {
        design: state.visual_design.clone(),
    };
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn update_campus_theme(
    campus: CampusThemeConfig,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<VisualDesignSnapshot, String> {
    let mut state = app_state.lock().map_err(|e| e.to_string())?;
    state.visual_design.campus = campus;
    touch_design(&mut state);
    let snapshot = VisualDesignSnapshot {
        design: state.visual_design.clone(),
    };
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn apply_design_preset(
    request: ApplyDesignPresetRequest,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<VisualDesignSnapshot, String> {
    let mut state = app_state.lock().map_err(|e| e.to_string())?;
    state.visual_design = preset_for(&request.preset_id);
    touch_design(&mut state);
    let snapshot = VisualDesignSnapshot {
        design: state.visual_design.clone(),
    };
    commit(app, &state)?;
    Ok(snapshot)
}

fn preset_for(preset_id: &str) -> CompanyVisualDesign {
    let mut design = CompanyVisualDesign::default();
    design.updated_at = Some(Utc::now().to_rfc3339());

    match preset_id {
        "sunset-campus" => {
            design.campus = CampusThemeConfig {
                sky_top: "#f6a86b".to_string(),
                sky_bottom: "#f9d9a8".to_string(),
                ground_primary: "#7a9b5d".to_string(),
                ground_secondary: "#688a4f".to_string(),
                ambient_intensity: 0.9,
            };
        }
        "night-campus" => {
            design.campus = CampusThemeConfig {
                sky_top: "#1a2744".to_string(),
                sky_bottom: "#3d5a80".to_string(),
                ground_primary: "#3f5f46".to_string(),
                ground_secondary: "#2f4a36".to_string(),
                ambient_intensity: 0.55,
            };
        }
        "glass-towers" => {
            for id in ["hq", "engineering", "hr"] {
                design.buildings.insert(
                    id.to_string(),
                    BuildingVisualConfig {
                        color: "#8eb8d8".to_string(),
                        roof_color: "#5a8fb8".to_string(),
                        accent_color: "#d9f0ff".to_string(),
                        style: crate::state::visual_design::BuildingStyle::Glass,
                        ..BuildingVisualConfig::default()
                    },
                );
            }
        }
        "warm-startup" => {
            design.campus.ground_primary = "#8faa62".to_string();
            for (id, color, roof, accent) in [
                ("hq", "#c9856a", "#a86d52", "#ffd166"),
                ("engineering", "#7d9eb8", "#5f7f9a", "#9fd5ff"),
                ("hr", "#c98ba0", "#a86d7f", "#ffb3c7"),
            ] {
                design.buildings.insert(
                    id.to_string(),
                    BuildingVisualConfig {
                        color: color.to_string(),
                        roof_color: roof.to_string(),
                        accent_color: accent.to_string(),
                        style: crate::state::visual_design::BuildingStyle::Startup,
                        ..BuildingVisualConfig::default()
                    },
                );
            }
        }
        _ => {}
    }

    design
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preset_returns_updated_design() {
        let design = preset_for("glass-towers");
        assert!(design.buildings.contains_key("hq"));
    }
}