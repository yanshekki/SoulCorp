import { getCatalogEntry } from "../data/furnitureCatalog";
import type { FurnitureInstance, InteriorZone, OfficeVisualConfig } from "../types/visualDesign";

const PREVIEW_DECOR_THRESHOLD = 8;

const ZONE_PLANT: Record<InteriorZone, string> = {
  lobby: "plant_ficus",
  corridor: "plant_potted",
  office: "plant_potted",
};

const ZONE_LIGHT: Record<InteriorZone, string> = {
  lobby: "floor_lamp",
  corridor: "floor_lamp",
  office: "floor_lamp",
};

function zoneDecorPosition(
  office: OfficeVisualConfig,
  zone: InteriorZone,
  kind: "plant" | "light",
): [number, number, number] {
  const room =
    zone === "lobby"
      ? office.lobby_room
      : zone === "corridor"
        ? office.corridor_room
        : office.room;
  const halfW = room.width * 0.32;
  const halfD = room.depth * 0.28;
  if (kind === "plant") {
    return [halfW, 0, halfD];
  }
  return [-halfW * 0.85, 0, -halfD * 0.75];
}

function zoneHasCategory(
  furniture: FurnitureInstance[],
  zone: InteriorZone,
  category: string,
): boolean {
  return furniture.some((item) => {
    if (item.zone !== zone || item.id.startsWith("preview-")) {
      return false;
    }
    const entry = getCatalogEntry(item.catalog_id);
    return entry?.category === category;
  });
}

function zoneNeedsPreviewDecor(furniture: FurnitureInstance[], zone: InteriorZone): boolean {
  const inZone = furniture.filter((item) => item.zone === zone && !item.id.startsWith("preview-"));
  return inZone.length < 2;
}

/** Adds ephemeral preview-only decor; does not mutate the source office. */
export function withPreviewDecor(office: OfficeVisualConfig, buildingId: string): OfficeVisualConfig {
  const furniture = office.furniture.filter((item) => !item.id.startsWith("preview-"));
  const sparse = furniture.length < PREVIEW_DECOR_THRESHOLD;
  if (!sparse) {
    return office;
  }

  const extras: FurnitureInstance[] = [];
  for (const zone of ["lobby", "corridor", "office"] as const) {
    if (!zoneNeedsPreviewDecor(furniture, zone)) {
      continue;
    }
    if (!zoneHasCategory(furniture, zone, "plant")) {
      extras.push({
        id: `preview-plant-${buildingId}-${zone}`,
        catalog_id: ZONE_PLANT[zone],
        zone,
        position: zoneDecorPosition(office, zone, "plant"),
        rotation_y: 0,
      });
    }
    if (zone === "lobby" && !furniture.some((item) => item.catalog_id === "wall_poster")) {
      const room = office.lobby_room;
      extras.push({
        id: `preview-poster-${buildingId}`,
        catalog_id: "wall_poster",
        zone: "lobby",
        position: [room.width * 0.22, 1.35, -room.depth / 2 + 0.1],
        rotation_y: 0,
      });
    }
    if (zone === "office" && !furniture.some((item) => item.catalog_id === "rug_runner")) {
      extras.push({
        id: `preview-rug-${buildingId}`,
        catalog_id: "rug_runner",
        zone: "office",
        position: [0, 0, 0.2],
        rotation_y: 0,
      });
    }
    if (!zoneHasCategory(furniture, zone, "lighting")) {
      extras.push({
        id: `preview-light-${buildingId}-${zone}`,
        catalog_id: ZONE_LIGHT[zone],
        zone,
        position: zoneDecorPosition(office, zone, "light"),
        rotation_y: 0,
      });
    }
  }

  if (extras.length === 0) {
    return office;
  }

  return {
    ...office,
    furniture: [...furniture, ...extras],
  };
}