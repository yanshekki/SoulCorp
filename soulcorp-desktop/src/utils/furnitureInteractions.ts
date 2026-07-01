import { invoke } from "@tauri-apps/api/core";
import { audioDirector, type SfxId } from "../audio/AudioDirector";
import { getCatalogEntry } from "../data/furnitureCatalog";
import { useGameStore } from "../stores/gameStore";
import type { FurnitureInstance, OfficeVisualConfig } from "../types/visualDesign";
import type { FurnitureHit } from "../components/world/interiorScene";
export type FurnitureAction =
  | "reception_hr"
  | "whiteboard_meeting"
  | "equipment_info"
  | "desk_assign"
  | "decor_buff"
  | "none";

export function furnitureActionForCatalog(catalogId: string): FurnitureAction {
  if (catalogId === "reception_desk") {
    return "reception_hr";
  }
  if (catalogId === "whiteboard") {
    return "whiteboard_meeting";
  }
  if (catalogId === "monitor" || catalogId === "laptop" || catalogId === "server_rack") {
    return "equipment_info";
  }
  if (catalogId.startsWith("desk_")) {
    return "desk_assign";
  }
  if (
    catalogId === "plant_ficus" ||
    catalogId === "plant_potted" ||
    catalogId === "sofa" ||
    catalogId === "sofa_corner"
  ) {
    return "decor_buff";
  }
  return "none";
}

export function sfxForFurnitureAction(action: FurnitureAction): SfxId | null {
  switch (action) {
    case "reception_hr":
    case "desk_assign":
      return "desk_tap";
    case "whiteboard_meeting":
      return "paper_rustle";
    case "equipment_info":
      return "keyboard_tap";
    case "decor_buff":
      return "soft_place";
    default:
      return null;
  }
}

export function furnitureInteractionHint(catalogId: string): string {
  const action = furnitureActionForCatalog(catalogId);
  const entry = getCatalogEntry(catalogId);
  const label = entry?.label ?? catalogId;
  switch (action) {
    case "reception_hr":
      return `${label} — open Recruitment`;
    case "whiteboard_meeting":
      return `${label} — new Meeting Notes page`;
    case "equipment_info":
      return `${label} — token usage & skills`;
    case "desk_assign":
      return `${label} — assign agent seat`;
    case "decor_buff":
      return `${label} — morale boost zone (2m)`;
    default:
      return label;
  }
}

export function bindAgentToDesk(
  office: OfficeVisualConfig,
  deskFurnitureId: string,
  agentId: string | null,
): FurnitureInstance[] {
  return office.furniture.map((item) => {
    if (item.id === deskFurnitureId) {
      return { ...item, linked_agent_id: agentId };
    }
    if (
      agentId &&
      item.catalog_id.startsWith("desk_") &&
      item.linked_agent_id === agentId &&
      item.id !== deskFurnitureId
    ) {
      return { ...item, linked_agent_id: null };
    }
    return item;
  });
}

async function openMeetingNotesPage(department: string): Promise<void> {
  const { listWorkspaceTree, refreshWorkspaceTree } = await import("../services/workspaceClient");
  const { useWorkspaceStore } = await import("../stores/workspaceStore");

  let tree = useWorkspaceStore.getState().tree;
  if (tree.folders.length === 0) {
    tree = await listWorkspaceTree();
    useWorkspaceStore.getState().setTree(tree);
  }

  const folder =
    tree.folders.find(
      (entry) => entry.workspace_type === "department" && entry.name.includes(department),
    ) ??
    tree.folders.find((entry) => entry.workspace_type === "department") ??
    tree.folders[0];

  if (!folder) {
    useGameStore.getState().setStatusMessage("Create a workspace folder before using the whiteboard.");
    return;
  }

  const page = await invoke<{ id: string; title: string; folder_id: string }>(
    "create_page_from_template_cmd",
    {
      request: {
        folder_id: folder.id,
        template_id: "meeting_notes",
        title: `${department} — Whiteboard session`,
      },
    },
  );

  await refreshWorkspaceTree(false);
  await useWorkspaceStore.getState().openPage(page.id);
  useGameStore.getState().setActivePanel("workspace");
  useGameStore.getState().setStatusMessage(`Opened ${page.title} in Workspace.`);
}

export async function handleFurnitureClick(hit: FurnitureHit, buildingId: string): Promise<void> {
  const state = useGameStore.getState();
  const action = furnitureActionForCatalog(hit.catalogId);
  const sfx = sfxForFurnitureAction(action);
  if (sfx) {
    audioDirector.playSfx(sfx);
  }

  state.setSelectedFurnitureId(hit.furnitureId);

  switch (action) {
    case "reception_hr":
      state.setActivePanel("recruitment");
      state.setStatusMessage("Reception — recruitment & morale tools.");
      break;
    case "whiteboard_meeting":
      await openMeetingNotesPage(
        state.buildings.find((building) => building.id === buildingId)?.department ?? "Team",
      );
      break;
    case "equipment_info":
    case "desk_assign":
    case "decor_buff":
      break;
    default:
      break;
  }
}

export function isMoraleDecorCatalog(catalogId: string): boolean {
  return furnitureActionForCatalog(catalogId) === "decor_buff";
}

export function hasMoraleDecorNearby(
  position: [number, number, number],
  office: OfficeVisualConfig,
  radius = 2,
): boolean {
  for (const item of office.furniture) {
    if (!isMoraleDecorCatalog(item.catalog_id)) {
      continue;
    }
    const dx = position[0] - item.position[0];
    const dz = position[2] - item.position[2];
    if (Math.hypot(dx, dz) <= radius) {
      return true;
    }
  }
  return false;
}