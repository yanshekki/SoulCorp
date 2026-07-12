use crate::db::persistence::commit;
use crate::state::visual_design::{
    AgentVisualConfig, BuildingStyle, BuildingVisualConfig, CampusThemeConfig, CompanyVisualDesign,
    OfficeDeskStyle, OfficeLighting, OfficeVisualConfig,
};
use crate::state::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

use crate::lock_util::MutexExt;
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

fn office_preset(
    floor: &str,
    wall: &str,
    accent: &str,
    desk: OfficeDeskStyle,
    lighting: OfficeLighting,
    lounge: bool,
) -> OfficeVisualConfig {
    OfficeVisualConfig {
        floor_color: floor.to_string(),
        wall_color: wall.to_string(),
        accent_color: accent.to_string(),
        desk_style: desk,
        lighting,
        has_plants: true,
        has_whiteboard: true,
        has_lounge_seating: lounge,
        desk_positions: Vec::new(),
        lobby_room: crate::state::visual_design::RoomDimensions {
            width: 10.0,
            depth: 7.0,
            height: 3.2,
        },
        corridor_room: crate::state::visual_design::RoomDimensions {
            width: 2.5,
            depth: 3.0,
            height: 3.2,
        },
        room: crate::state::visual_design::RoomDimensions::default(),
        furniture: Vec::new(),
    }
}

fn building_preset(
    color: &str,
    roof: &str,
    accent: &str,
    style: BuildingStyle,
) -> BuildingVisualConfig {
    BuildingVisualConfig {
        color: color.to_string(),
        roof_color: roof.to_string(),
        accent_color: accent.to_string(),
        style,
        ..BuildingVisualConfig::default()
    }
}

#[tauri::command]
pub fn get_visual_design(state: State<'_, Mutex<AppState>>) -> Result<VisualDesignSnapshot, String> {
    let state = state.lock_or_recover()?;
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
    let mut state = app_state.lock_or_recover()?;
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
    let mut state = app_state.lock_or_recover()?;
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
    let mut state = app_state.lock_or_recover()?;
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
    let mut state = app_state.lock_or_recover()?;
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
    let mut state = app_state.lock_or_recover()?;
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
    let mut state = app_state.lock_or_recover()?;
    state.visual_design = preset_for(&request.preset_id);
    touch_design(&mut state);
    let snapshot = VisualDesignSnapshot {
        design: state.visual_design.clone(),
    };
    commit(app, &state)?;
    Ok(snapshot)
}

pub fn preset_for(preset_id: &str) -> CompanyVisualDesign {
    let mut design = CompanyVisualDesign {
        updated_at: Some(Utc::now().to_rfc3339()),
        ..Default::default()
    };

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
            for id in ["hq", "engineering", "hr", "plaza", "park"] {
                design.buildings.insert(
                    id.to_string(),
                    building_preset("#5a6d82", "#3d4f62", "#9fd5ff", BuildingStyle::Modern),
                );
            }
        }
        "glass-towers" => {
            for id in ["hq", "engineering", "hr", "plaza", "park"] {
                design.buildings.insert(
                    id.to_string(),
                    building_preset("#8eb8d8", "#5a8fb8", "#d9f0ff", BuildingStyle::Glass),
                );
                design.offices.insert(
                    id.to_string(),
                    office_preset(
                        "#e4edf5",
                        "#f5fafd",
                        "#9fd5ff",
                        OfficeDeskStyle::Open,
                        OfficeLighting::Cool,
                        false,
                    ),
                );
            }
        }
        "warm-startup" => {
            design.campus.ground_primary = "#8faa62".to_string();
            design.campus.ground_secondary = "#7a9a55".to_string();
            design.campus.ambient_intensity = 0.92;
            for (id, color, roof, accent, desk, lounge) in [
                (
                    "hq",
                    "#c9856a",
                    "#a86d52",
                    "#ffd166",
                    OfficeDeskStyle::Executive,
                    false,
                ),
                (
                    "engineering",
                    "#7d9eb8",
                    "#5f7f9a",
                    "#9fd5ff",
                    OfficeDeskStyle::Creative,
                    false,
                ),
                (
                    "hr",
                    "#c98ba0",
                    "#a86d7f",
                    "#ffb3c7",
                    OfficeDeskStyle::Lounge,
                    true,
                ),
                (
                    "plaza",
                    "#a6896b",
                    "#8a7258",
                    "#f2c879",
                    OfficeDeskStyle::Open,
                    false,
                ),
                (
                    "park",
                    "#6f9b7a",
                    "#5a8a65",
                    "#b8e6c8",
                    OfficeDeskStyle::Lounge,
                    true,
                ),
            ] {
                design.buildings.insert(
                    id.to_string(),
                    building_preset(color, roof, accent, BuildingStyle::Startup),
                );
                design.offices.insert(
                    id.to_string(),
                    office_preset(
                        "#e8dfd2",
                        "#faf6ef",
                        accent,
                        desk,
                        OfficeLighting::Warm,
                        lounge,
                    ),
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
        assert!(design.buildings.contains_key("park"));
        assert!(design.offices.contains_key("engineering"));
    }

    #[test]
    fn warm_startup_sets_all_buildings() {
        let design = preset_for("warm-startup");
        for id in ["hq", "engineering", "hr", "plaza", "park"] {
            assert!(design.buildings.contains_key(id));
            assert!(design.offices.contains_key(id));
        }
    }
}