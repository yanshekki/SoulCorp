import type {
  OfficeDeskStyle,
  OfficeLighting,
  OfficeThemePackId,
  OfficeVisualConfig,
} from "../types/visualDesign";

export interface OfficeThemePack {
  id: OfficeThemePackId;
  label: string;
  description: string;
  floor_color: string;
  wall_color: string;
  accent_color: string;
  lighting: OfficeLighting;
  desk_style: OfficeDeskStyle;
  has_plants: boolean;
  has_whiteboard: boolean;
  has_lounge_seating: boolean;
  /** Window emissive tint (room shell, Phase B3) */
  window_tint: string;
  /** Scene background boost base */
  scene_background: string;
}

export const OFFICE_THEME_PACKS: Record<OfficeThemePackId, OfficeThemePack> = {
  startup_warm: {
    id: "startup_warm",
    label: "Startup Warm",
    description: "Sims-style oak floors, cream walls, honey accent — default theme",
    floor_color: "#c9a882",
    wall_color: "#f5f0e8",
    accent_color: "#e8a838",
    lighting: "warm",
    desk_style: "open",
    has_plants: true,
    has_whiteboard: true,
    has_lounge_seating: false,
    window_tint: "#ffe8c8",
    scene_background: "#e8dfd2",
  },
  corporate_cool: {
    id: "corporate_cool",
    label: "Corporate Cool",
    description: "Cool grey floors, white walls, tech-blue accent",
    floor_color: "#9aa3ad",
    wall_color: "#e8ecf0",
    accent_color: "#5ec8ff",
    lighting: "cool",
    desk_style: "cubicle",
    has_plants: true,
    has_whiteboard: true,
    has_lounge_seating: false,
    window_tint: "#d8ecff",
    scene_background: "#dce2e8",
  },
  clinical_playful: {
    id: "clinical_playful",
    label: "Clinical Playful",
    description: "Two Point Hospital vibe — mint green + coral accent",
    floor_color: "#b8d4c8",
    wall_color: "#f0f8f5",
    accent_color: "#ff8a7a",
    lighting: "natural",
    desk_style: "lounge",
    has_plants: true,
    has_whiteboard: false,
    has_lounge_seating: true,
    window_tint: "#f4f8ff",
    scene_background: "#e0ebe6",
  },
};

export const DEFAULT_OFFICE_THEME_PACK_ID: OfficeThemePackId = "startup_warm";

export function getOfficeThemePack(id: OfficeThemePackId | undefined): OfficeThemePack {
  return OFFICE_THEME_PACKS[id ?? DEFAULT_OFFICE_THEME_PACK_ID];
}

/** Applies theme swatches and decor defaults; preserves room sizes and furniture. */
export function applyOfficeThemePack(
  office: OfficeVisualConfig,
  packId: OfficeThemePackId,
): OfficeVisualConfig {
  const pack = getOfficeThemePack(packId);
  return {
    ...office,
    theme_pack: packId,
    floor_color: pack.floor_color,
    wall_color: pack.wall_color,
    accent_color: pack.accent_color,
    lighting: pack.lighting,
    desk_style: pack.desk_style,
    has_plants: pack.has_plants,
    has_whiteboard: pack.has_whiteboard,
    has_lounge_seating: pack.has_lounge_seating,
  };
}

export const OFFICE_THEME_PACK_LIST = Object.values(OFFICE_THEME_PACKS);