export type BuildingStyle = "modern" | "classic" | "glass" | "industrial" | "startup";
export type OfficeDeskStyle = "open" | "cubicle" | "executive" | "creative" | "lounge";
export type OfficeLighting = "warm" | "cool" | "natural";
export type DesignHairStyle = "short" | "bob" | "spiky" | "long";
export type DesignCategory = "campus" | "buildings" | "offices" | "agents";

export interface BuildingVisualConfig {
  color: string;
  roof_color: string;
  accent_color: string;
  size: [number, number, number];
  style: BuildingStyle;
  signage: string;
}

export interface OfficeVisualConfig {
  floor_color: string;
  wall_color: string;
  accent_color: string;
  desk_style: OfficeDeskStyle;
  lighting: OfficeLighting;
  has_plants: boolean;
  has_whiteboard: boolean;
  has_lounge_seating: boolean;
}

export interface AgentVisualConfig {
  skin_color: string;
  shirt_color: string;
  pants_color: string;
  hair_color: string;
  shoe_color: string;
  hair_style: DesignHairStyle;
  height: number;
  build: number;
  accessory?: string | null;
}

export interface CampusThemeConfig {
  sky_top: string;
  sky_bottom: string;
  ground_primary: string;
  ground_secondary: string;
  ambient_intensity: number;
}

export interface CompanyVisualDesign {
  campus: CampusThemeConfig;
  buildings: Record<string, BuildingVisualConfig>;
  offices: Record<string, OfficeVisualConfig>;
  agents: Record<string, AgentVisualConfig>;
  updated_at?: string | null;
}

export interface DesignPreset {
  id: string;
  title: string;
  description: string;
  category: "campus" | "full";
  preview: string;
}

export const DEFAULT_CAMPUS_THEME: CampusThemeConfig = {
  sky_top: "#8ec8ef",
  sky_bottom: "#b7daf5",
  ground_primary: "#6f9a67",
  ground_secondary: "#5d8a57",
  ambient_intensity: 0.85,
};

export const DEFAULT_BUILDING_VISUAL: BuildingVisualConfig = {
  color: "#6d7f9b",
  roof_color: "#4a6fa5",
  accent_color: "#5ec8ff",
  size: [3.8, 2.8, 3.4],
  style: "modern",
  signage: "",
};

export const DEFAULT_OFFICE_VISUAL: OfficeVisualConfig = {
  floor_color: "#d9cfc0",
  wall_color: "#f5f0e8",
  accent_color: "#5ec8ff",
  desk_style: "open",
  lighting: "natural",
  has_plants: true,
  has_whiteboard: true,
  has_lounge_seating: false,
};

export const DEFAULT_AGENT_VISUAL: AgentVisualConfig = {
  skin_color: "#f1c7a5",
  shirt_color: "#5ec8ff",
  pants_color: "#3d4f6f",
  hair_color: "#2b1d12",
  shoe_color: "#2a2a2a",
  hair_style: "short",
  height: 1.0,
  build: 1.0,
  accessory: null,
};

export const EMPTY_VISUAL_DESIGN: CompanyVisualDesign = {
  campus: DEFAULT_CAMPUS_THEME,
  buildings: {},
  offices: {},
  agents: {},
  updated_at: null,
};