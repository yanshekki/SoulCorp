use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BuildingStyle {
    #[default]
    Modern,
    Classic,
    Glass,
    Industrial,
    Startup,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OfficeDeskStyle {
    #[default]
    Open,
    Cubicle,
    Executive,
    Creative,
    Lounge,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OfficeLighting {
    Warm,
    Cool,
    #[default]
    Natural,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HairStyle {
    #[default]
    Short,
    Bob,
    Spiky,
    Long,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildingVisualConfig {
    pub color: String,
    pub roof_color: String,
    pub accent_color: String,
    #[serde(default = "default_building_size")]
    pub size: [f32; 3],
    #[serde(default)]
    pub style: BuildingStyle,
    #[serde(default)]
    pub signage: String,
}

fn default_building_size() -> [f32; 3] {
    [3.8, 2.8, 3.4]
}

impl Default for BuildingVisualConfig {
    fn default() -> Self {
        Self {
            color: "#6d7f9b".to_string(),
            roof_color: "#4a6fa5".to_string(),
            accent_color: "#5ec8ff".to_string(),
            size: default_building_size(),
            style: BuildingStyle::Modern,
            signage: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InteriorZone {
    Lobby,
    Corridor,
    Office,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomDimensions {
    pub width: f32,
    pub depth: f32,
    pub height: f32,
}

impl Default for RoomDimensions {
    fn default() -> Self {
        Self {
            width: 22.0,
            depth: 16.0,
            height: 3.2,
        }
    }
}

fn default_lobby_room() -> RoomDimensions {
    RoomDimensions {
        width: 8.0,
        depth: 5.0,
        height: 3.2,
    }
}

fn default_corridor_room() -> RoomDimensions {
    RoomDimensions {
        width: 4.0,
        depth: 3.0,
        height: 3.2,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FurnitureInstance {
    pub id: String,
    pub catalog_id: String,
    pub zone: InteriorZone,
    pub position: [f32; 3],
    pub rotation_y: f32,
    #[serde(default = "default_furniture_scale")]
    pub scale: f32,
    #[serde(default)]
    pub linked_agent_id: Option<String>,
}

fn default_furniture_scale() -> f32 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfficeVisualConfig {
    pub floor_color: String,
    pub wall_color: String,
    pub accent_color: String,
    #[serde(default)]
    pub desk_style: OfficeDeskStyle,
    #[serde(default)]
    pub lighting: OfficeLighting,
    #[serde(default)]
    pub has_plants: bool,
    #[serde(default)]
    pub has_whiteboard: bool,
    #[serde(default)]
    pub has_lounge_seating: bool,
    #[serde(default)]
    pub desk_positions: Vec<[f32; 3]>,
    #[serde(default = "default_lobby_room")]
    pub lobby_room: RoomDimensions,
    #[serde(default = "default_corridor_room")]
    pub corridor_room: RoomDimensions,
    #[serde(default)]
    pub room: RoomDimensions,
    #[serde(default)]
    pub furniture: Vec<FurnitureInstance>,
}

impl Default for OfficeVisualConfig {
    fn default() -> Self {
        Self {
            floor_color: "#d9cfc0".to_string(),
            wall_color: "#f5f0e8".to_string(),
            accent_color: "#5ec8ff".to_string(),
            desk_style: OfficeDeskStyle::Open,
            lighting: OfficeLighting::Natural,
            has_plants: true,
            has_whiteboard: true,
            has_lounge_seating: false,
            desk_positions: Vec::new(),
            lobby_room: default_lobby_room(),
            corridor_room: default_corridor_room(),
            room: RoomDimensions::default(),
            furniture: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentVisualConfig {
    pub skin_color: String,
    pub shirt_color: String,
    pub pants_color: String,
    pub hair_color: String,
    pub shoe_color: String,
    #[serde(default)]
    pub hair_style: HairStyle,
    #[serde(default = "default_agent_height")]
    pub height: f32,
    #[serde(default = "default_agent_build")]
    pub build: f32,
    #[serde(default)]
    pub accessory: Option<String>,
}

fn default_agent_height() -> f32 {
    1.0
}

fn default_agent_build() -> f32 {
    1.0
}

impl Default for AgentVisualConfig {
    fn default() -> Self {
        Self {
            skin_color: "#f1c7a5".to_string(),
            shirt_color: "#5ec8ff".to_string(),
            pants_color: "#3d4f6f".to_string(),
            hair_color: "#2b1d12".to_string(),
            shoe_color: "#2a2a2a".to_string(),
            hair_style: HairStyle::Short,
            height: default_agent_height(),
            build: default_agent_build(),
            accessory: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CampusThemeConfig {
    pub sky_top: String,
    pub sky_bottom: String,
    pub ground_primary: String,
    pub ground_secondary: String,
    #[serde(default = "default_ambient")]
    pub ambient_intensity: f32,
}

fn default_ambient() -> f32 {
    0.85
}

impl Default for CampusThemeConfig {
    fn default() -> Self {
        Self {
            sky_top: "#8ec8ef".to_string(),
            sky_bottom: "#b7daf5".to_string(),
            ground_primary: "#6f9a67".to_string(),
            ground_secondary: "#5d8a57".to_string(),
            ambient_intensity: default_ambient(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CompanyVisualDesign {
    #[serde(default)]
    pub campus: CampusThemeConfig,
    #[serde(default)]
    pub buildings: HashMap<String, BuildingVisualConfig>,
    #[serde(default)]
    pub offices: HashMap<String, OfficeVisualConfig>,
    #[serde(default)]
    pub agents: HashMap<String, AgentVisualConfig>,
    #[serde(default)]
    pub updated_at: Option<String>,
}