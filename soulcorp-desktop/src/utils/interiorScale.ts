import { INITIAL_BUILDINGS } from "../data/initialWorld";
import type { Building } from "../types/world";
import type { FurnitureInstance, InteriorZone, OfficeVisualConfig, RoomDimensions } from "../types/visualDesign";

/** Bump when room/camera proportions change — forces interior rebuild. */
export const INTERIOR_LAYOUT_VERSION = 3;

/** Visual-only boost so GLTF props read clearly at game camera distance. */
export const FURNITURE_DISPLAY_SCALE = 1.22;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function roomsFromBuilding(building: Building): {
  lobby_room: RoomDimensions;
  corridor_room: RoomDimensions;
  room: RoomDimensions;
} {
  const [width, , depth] = building.size;
  return {
    lobby_room: {
      width: round1(width * 0.92),
      depth: round1(depth * 0.5),
      height: 2.55,
    },
    corridor_room: {
      width: round1(Math.max(1.2, width * 0.3)),
      depth: round1(Math.max(1.2, depth * 0.2)),
      height: 2.55,
    },
    room: {
      width: round1(width * 0.86),
      depth: round1(depth * 0.68),
      height: 2.55,
    },
  };
}

export function defaultBuildingForId(buildingId: string): Building {
  return INITIAL_BUILDINGS.find((entry) => entry.id === buildingId) ?? INITIAL_BUILDINGS[0];
}

/** Legacy layout sizes before building-matched proportions. */
export const LEGACY_ZONE_SIZES: Record<
  string,
  { lobby: [number, number]; office: [number, number] }
> = {
  hq: { lobby: [10, 7], office: [12, 9] },
  engineering: { lobby: [9, 6], office: [11, 8] },
  hr: { lobby: [8, 6], office: [10, 7] },
  plaza: { lobby: [11, 5], office: [12, 6] },
  park: { lobby: [8, 5], office: [9, 6] },
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

export function floorTextureRepeat(width: number, depth: number): [number, number] {
  return [Math.max(2, width / 1.2), Math.max(2, depth / 1.2)];
}