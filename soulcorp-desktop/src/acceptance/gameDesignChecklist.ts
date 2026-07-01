export interface ChecklistItem {
  id: string;
  element: string;
  action: string;
  gameFunction: string;
  audio: string;
  automated: boolean;
}

/** Game designer walkthrough — maps 3D interactions to gameplay (Phase 6 acceptance). */
export const GAME_DESIGN_CHECKLIST: ChecklistItem[] = [
  {
    id: "campus_door",
    element: "Campus door + signage",
    action: "Hover / Click",
    gameFunction: "Enter department interior",
    audio: "door_hover, door_open",
    automated: true,
  },
  {
    id: "building_shell",
    element: "Building shell (non-door)",
    action: "Click",
    gameFunction: "Open BuildingModal stats",
    audio: "ui_open",
    automated: true,
  },
  {
    id: "interior_exit",
    element: "Interior exit door",
    action: "Click",
    gameFunction: "exitInterior() → campus",
    audio: "door_close",
    automated: true,
  },
  {
    id: "reception_desk",
    element: "Reception desk",
    action: "Click",
    gameFunction: "Recruitment panel shortcut",
    audio: "desk_tap",
    automated: true,
  },
  {
    id: "whiteboard",
    element: "Whiteboard",
    action: "Click",
    gameFunction: "Workspace meeting_notes template",
    audio: "paper_rustle",
    automated: true,
  },
  {
    id: "equipment",
    element: "Monitor / server",
    action: "Click",
    gameFunction: "Token budget + agent skills panel",
    audio: "keyboard_tap",
    automated: true,
  },
  {
    id: "desk_build",
    element: "Desk + chair",
    action: "Build Mode place / Click assign",
    gameFunction: "Seat assignment via furniture[] + linked_agent_id",
    audio: "furniture_place, desk_tap",
    automated: true,
  },
  {
    id: "decor_morale",
    element: "Plants / sofa",
    action: "Place / proximity",
    gameFunction: "Morale buff within 2m (game mode)",
    audio: "soft_place",
    automated: true,
  },
  {
    id: "agent_interior",
    element: "Agent (interior)",
    action: "Click",
    gameFunction: "AgentDetailPanel + skills",
    audio: "agent_select",
    automated: true,
  },
  {
    id: "build_hammer",
    element: "Build hammer HUD",
    action: "Toggle",
    gameFunction: "buildMode place/move/rotate/delete",
    audio: "ui_mode_switch",
    automated: true,
  },
  {
    id: "studio_floor_plan",
    element: "Design Studio floor plan",
    action: "Drag / place",
    gameFunction: "Shared furniture[] with game",
    audio: "furniture_place",
    automated: true,
  },
  {
    id: "fallback_map",
    element: "Low-power 2D map",
    action: "View",
    gameFunction: "Floor plan + campus map fallback",
    audio: "—",
    automated: true,
  },
];