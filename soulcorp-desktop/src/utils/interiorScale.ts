import { hkRoomsForBuilding } from "../data/hkOfficeLayouts";
import { INITIAL_BUILDINGS } from "../data/initialWorld";
import type { Building } from "../types/world";
import type { FurnitureInstance, InteriorZone, OfficeVisualConfig, RoomDimensions } from "../types/visualDesign";

/** Bump when room/camera proportions change — forces interior rebuild. */
export const INTERIOR_LAYOUT_VERSION = 4;

/** Visual-only boost so GLTF props read clearly at game camera distance. */
export const FURNITURE_DISPLAY_SCALE = 1.22;

export function roomsFromBuilding(building: Building): {
  lobby_room: RoomDimensions;
  corridor_room: RoomDimensions;
  room: RoomDimensions;
} {
  return hkRoomsForBuilding(building.id);
}

export function defaultBuildingForId(buildingId: string): Building {
  return INITIAL_BUILDINGS.find((entry) => entry.id === buildingId) ?? INITIAL_BUILDINGS[0];
}

/** Legacy layout sizes before building-matched proportions. */
export const LEGACY_ZONE_SIZES: Record<
  string,
  { lobby: [number, number]; office: [number, number] }
> = {
  hq: { lobby: [8, 5], office: [22, 16] },
  engineering: { lobby: [8, 5], office: [22, 16] },
  hr: { lobby: [8, 5], office: [22, 16] },
  plaza: { lobby: [8, 5], office: [22, 16] },
  park: { lobby: [8, 5], office: [22, 16] },
};

export function zoneRoomDimensions(
  office: OfficeVisualConfig,
  zone: InteriorZone,
): RoomDimensions {
  switch (zone) {
    case "lobby":
      return office.lobby_room;
    case "corridor":
      return office.corridor_room;
    default:
      return office.room;
  }
}

export function scaleFurnitureForGameRooms(
  furniture: FurnitureInstance[],
  buildingId: string,
  office: OfficeVisualConfig,
): FurnitureInstance[] {
  const legacy = LEGACY_ZONE_SIZES[buildingId] ?? LEGACY_ZONE_SIZES.hq;
  const targets = {
    lobby: [office.lobby_room.width, office.lobby_room.depth] as [number, number],
    corridor: [office.corridor_room.width, office.corridor_room.depth] as [number, number],
    office: [office.room.width, office.room.depth] as [number, number],
  };
  const sources = {
    lobby: legacy.lobby,
    corridor: [2.5, 3] as [number, number],
    office: legacy.office,
  };

  return furniture.map((item) => {
    const source = sources[item.zone];
    const target = targets[item.zone];
    if (!source || !target) {
      return item;
    }
    const sx = target[0] / source[0];
    const sz = target[1] / source[1];
    if (Math.abs(sx - 1) < 0.02 && Math.abs(sz - 1) < 0.02) {
      return item;
    }
    return {
      ...item,
      position: [item.position[0] * sx, item.position[1], item.position[2] * sz],
    };
  });
}

/** 1 m world units per texture repeat (Phase B3 room kit). */
export function floorTextureRepeat(width: number, depth: number): [number, number] {
  return [Math.max(1, width), Math.max(1, depth)];
}