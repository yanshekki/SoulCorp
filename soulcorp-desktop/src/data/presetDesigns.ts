import type { CompanyVisualDesign } from "../types/visualDesign";
import { EMPTY_VISUAL_DESIGN } from "../types/visualDesign";
import { applyHkOfficeTemplate, hkRoomsForBuilding } from "./hkOfficeLayouts";

/** Frontend mirror of Rust `preset_for` for live preview before save. */
export function presetDesignFor(presetId: string): CompanyVisualDesign {
  const design: CompanyVisualDesign = structuredClone(EMPTY_VISUAL_DESIGN);
  design.updated_at = new Date().toISOString();

  switch (presetId) {
    case "sunset-campus":
      design.campus = {
        sky_top: "#f6a86b",
        sky_bottom: "#f9d9a8",
        ground_primary: "#7a9b5d",
        ground_secondary: "#688a4f",
        ambient_intensity: 0.9,
      };
      break;
    case "night-campus":
      design.campus = {
        sky_top: "#1a2744",
        sky_bottom: "#3d5a80",
        ground_primary: "#3f5f46",
        ground_secondary: "#2f4a36",
        ambient_intensity: 0.55,
      };
      break;
    case "glass-towers":
      for (const id of ["hq", "engineering", "hr", "plaza", "park"]) {
        design.buildings[id] = {
          color: "#8eb8d8",
          roof_color: "#5a8fb8",
          accent_color: "#d9f0ff",
          size: [3.8, 2.8, 3.4],
          style: "glass",
          signage: "",
        };
      }
      break;
    case "warm-startup":
      design.campus.ground_primary = "#8faa62";
      design.campus.ground_secondary = "#7a9a55";
      for (const [id, color, roof, accent, desk] of [
        ["hq", "#c9856a", "#a86d52", "#ffd166", "executive"],
        ["engineering", "#7d9eb8", "#5f7f9a", "#9fd5ff", "creative"],
        ["hr", "#c98ba0", "#a86d7f", "#ffb3c7", "lounge"],
        ["plaza", "#a6896b", "#8a7258", "#f2c879", "open"],
        ["park", "#6f9b7a", "#5a8a65", "#b8e6c8", "lounge"],
      ] as const) {
        design.buildings[id] = {
          color,
          roof_color: roof,
          accent_color: accent,
          size: [3.8, 2.8, 3.4],
          style: "startup",
          signage: "",
        };
        const rooms = hkRoomsForBuilding(id);
        const hkTemplate = applyHkOfficeTemplate(id);
        design.offices[id] = {
          layout_template: hkTemplate.layout_template,
          architecture: hkTemplate.architecture!,
          lobby_room: rooms.lobby_room,
          corridor_room: rooms.corridor_room,
          room: rooms.room,
          floor_color: "#c9a882",
          wall_color: "#f5f0e8",
          accent_color: accent,
          theme_pack: "startup_warm",
          desk_style: desk,
          lighting: "warm",
          has_plants: true,
          has_whiteboard: id === "engineering",
          has_lounge_seating: id === "hr" || id === "park",
          desk_positions: [],
          furniture: [],
        };
      }
      break;
    default:
      break;
  }

  return design;
}