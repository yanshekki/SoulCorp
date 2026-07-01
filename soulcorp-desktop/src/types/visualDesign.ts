export type BuildingStyle = "modern" | "classic" | "glass" | "industrial" | "startup";
export type OfficeDeskStyle = "open" | "cubicle" | "executive" | "creative" | "lounge";
export type OfficeLighting = "warm" | "cool" | "natural";
export type OfficeThemePackId = "startup_warm" | "corporate_cool" | "clinical_playful";
export type DesignHairStyle = "short" | "bob" | "spiky" | "long";
export type DesignCategory = "campus" | "buildings" | "offices" | "agents";
export type InteriorZone = "lobby" | "corridor" | "office";

export type OfficeLayoutTemplateId = "hk_mixed_50";
export type FurnitureCategory =
  | "desk"
  | "chair"
  | "decor"
  | "plant"
  | "tech"
  | "storage"
  | "lighting"
  | "structure";

export interface FurnitureCatalogEntry {
  id: string;
  label: string;
  category: FurnitureCategory;
  footprint: [number, number];
  gltfPath: string;
  /** Optional Blender-authored GLB override (see scripts/import-blender-gltf.mjs). */
  blenderGltfPath?: string;
  snapToGrid: boolean;
  gridSize: number;
  rotatable: boolean;
  deskStyle?: OfficeDeskStyle;
  defaultProps?: Record<string, unknown>;
}

export interface RoomDimensions {
  width: number;
  depth: number;
  height: number;
}

/** Phase 4 — freeform wall segment in floor-plan coordinates (x, planY). */
export interface OfficeWallSegment {
  id: string;
  floor: number;
  start: [number, number];
  end: [number, number];
}

/** Phase 4 — optional RoomSketcher-style architecture + multi-floor. */
export interface OfficeArchitecture {
  freeform_enabled: boolean;
  floor_count: number;
  walls: OfficeWallSegment[];
}

export const DEFAULT_OFFICE_ARCHITECTURE: OfficeArchitecture = {
  freeform_enabled: false,
  floor_count: 1,
  walls: [],
};

export const OFFICE_ARCHITECTURE_FLOOR_MIN = 1;
export const OFFICE_ARCHITECTURE_FLOOR_MAX = 3;

export interface FurnitureInstance {
  id: string;
  catalog_id: string;
  zone: InteriorZone;
  position: [number, number, number];
  rotation_y: number;
  scale?: number;
  linked_agent_id?: string | null;
}

export interface BuildingVisualConfig {
  color: string;
  roof_color: string;
  accent_color: string;
  size: [number, number, number];
  style: BuildingStyle;
  signage: string;
}

export interface OfficeVisualConfig {
  /** Professional floor-plan preset (e.g. Hong Kong 50-person mixed office). */
  layout_template?: OfficeLayoutTemplateId;
  /** Sims×TPH theme pack; default startup_warm for new offices */
  theme_pack?: OfficeThemePackId;
  floor_color: string;
  wall_color: string;
  accent_color: string;
  desk_style: OfficeDeskStyle;
  lighting: OfficeLighting;
  has_plants: boolean;
  has_whiteboard: boolean;
  has_lounge_seating: boolean;
  /** @deprecated Migrated into furniture[] — kept for save compatibility */
  desk_positions?: [number, number, number][];
  lobby_room: RoomDimensions;
  corridor_room: RoomDimensions;
  room: RoomDimensions;
  furniture: FurnitureInstance[];
  /** Phase 4 — optional freeform walls and stacked floors (default off). */
  architecture?: OfficeArchitecture;
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

export const DEFAULT_LOBBY_ROOM: RoomDimensions = { width: 8, depth: 5, height: 3.2 };
export const DEFAULT_CORRIDOR_ROOM: RoomDimensions = { width: 4, depth: 3, height: 3.2 };
export const DEFAULT_OFFICE_ROOM: RoomDimensions = { width: 22, depth: 16, height: 3.2 };

export const DEFAULT_OFFICE_VISUAL: OfficeVisualConfig = {
  theme_pack: "startup_warm",
  floor_color: "#c9a882",
  wall_color: "#f5f0e8",
  accent_color: "#e8a838",
  desk_style: "open",
  lighting: "warm",
  has_plants: true,
  has_whiteboard: true,
  has_lounge_seating: false,
  desk_positions: [],
  lobby_room: DEFAULT_LOBBY_ROOM,
  corridor_room: DEFAULT_CORRIDOR_ROOM,
  room: DEFAULT_OFFICE_ROOM,
  furniture: [],
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