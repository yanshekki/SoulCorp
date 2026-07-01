import type {
  OfficeArchitecture,
  OfficeDeskStyle,
  OfficeVisualConfig,
  OfficeWallSegment,
  RoomDimensions,
} from "../types/visualDesign";

export const HK_LAYOUT_TEMPLATE_ID = "hk_mixed_50" as const;

export const HK_LOBBY_ROOM: RoomDimensions = { width: 8, depth: 5, height: 3.2 };
export const HK_CORRIDOR_ROOM: RoomDimensions = { width: 4, depth: 3, height: 3.2 };
export const HK_OFFICE_ROOM: RoomDimensions = { width: 22, depth: 16, height: 3.2 };

/** Plan-x where open plan meets side rooms (metres, floor-plan coords). */
export const HK_SIDE_STRIP_PLAN_X = 16;

export interface HkFunctionalArea {
  id: string;
  label: string;
  /** Zone-local centre (office zone, metres). */
  center: [number, number];
  size: [number, number];
}

export interface HkBuildingVariant {
  deskStyle: OfficeDeskStyle;
  deskCount: number;
  managerRooms: number;
  meetingRooms: number;
  hasLoungeSeating: boolean;
  hasWhiteboard: boolean;
  hasServerCorner: boolean;
  enlargedPantry: boolean;
}

const BUILDING_IDS = ["hq", "engineering", "hr", "plaza", "park"] as const;
export type HkBuildingId = (typeof BUILDING_IDS)[number];

export const HK_BUILDING_VARIANTS: Record<HkBuildingId, HkBuildingVariant> = {
  hq: {
    deskStyle: "executive",
    deskCount: 50,
    managerRooms: 4,
    meetingRooms: 2,
    hasLoungeSeating: true,
    hasWhiteboard: true,
    hasServerCorner: false,
    enlargedPantry: false,
  },
  engineering: {
    deskStyle: "creative",
    deskCount: 50,
    managerRooms: 2,
    meetingRooms: 1,
    hasLoungeSeating: false,
    hasWhiteboard: true,
    hasServerCorner: true,
    enlargedPantry: false,
  },
  hr: {
    deskStyle: "open",
    deskCount: 50,
    managerRooms: 2,
    meetingRooms: 2,
    hasLoungeSeating: true,
    hasWhiteboard: true,
    hasServerCorner: false,
    enlargedPantry: false,
  },
  plaza: {
    deskStyle: "open",
    deskCount: 50,
    managerRooms: 2,
    meetingRooms: 1,
    hasLoungeSeating: true,
    hasWhiteboard: true,
    hasServerCorner: false,
    enlargedPantry: false,
  },
  park: {
    deskStyle: "lounge",
    deskCount: 50,
    managerRooms: 2,
    meetingRooms: 1,
    hasLoungeSeating: true,
    hasWhiteboard: false,
    hasServerCorner: false,
    enlargedPantry: true,
  },
};

function officePlanYStart(): number {
  return HK_LOBBY_ROOM.depth + HK_CORRIDOR_ROOM.depth;
}

function wall(id: string, start: [number, number], end: [number, number]): OfficeWallSegment {
  return { id, floor: 0, start, end };
}

/** Partition walls for HK mixed layout (plan coordinates). */
export function buildHkPartitionWalls(variant: HkBuildingVariant): OfficeWallSegment[] {
  const y0 = officePlanYStart();
  const yEnd = y0 + HK_OFFICE_ROOM.depth;
  const xSide = HK_SIDE_STRIP_PLAN_X;
  const walls: OfficeWallSegment[] = [
    wall("hk-main-divider", [xSide, y0], [xSide, yEnd]),
  ];

  const stripHeight = HK_OFFICE_ROOM.depth;
  const mgrSlots = Math.max(variant.managerRooms, 1);
  const meetSlots = Math.max(variant.meetingRooms, 1);
  const pantryDepth = variant.enlargedPantry ? 3.5 : 2.5;
  const meetTotalDepth = meetSlots >= 2 ? 5.5 : 4;
  const mgrBand = (stripHeight - meetTotalDepth - pantryDepth) / mgrSlots;

  let cursor = y0;
  if (meetSlots >= 1) {
    const meetDepth = meetSlots >= 2 ? 3 : meetTotalDepth;
    cursor += meetDepth;
    walls.push(wall("hk-meet-bottom", [xSide, cursor], [22, cursor]));
    walls.push(wall("hk-meet-side", [19, y0], [19, cursor]));
    if (meetSlots >= 2) {
      const meetMid = y0 + 3;
      walls.push(wall("hk-meet-split", [19, y0], [19, meetMid]));
    }
  }

  for (let index = 0; index < mgrSlots; index += 1) {
    const next = cursor + mgrBand;
    if (index < mgrSlots - 1 || !variant.enlargedPantry) {
      walls.push(wall(`hk-mgr-${index}`, [xSide, next], [22, next]));
    }
    cursor = next;
  }

  const pantryY = yEnd - pantryDepth;
  walls.push(wall("hk-pantry-top", [xSide, pantryY], [22, pantryY]));
  walls.push(wall("hk-pantry-side", [19, pantryY], [19, yEnd]));

  return walls;
}

export function hkFunctionalAreas(variant: HkBuildingVariant): HkFunctionalArea[] {
  const halfW = HK_OFFICE_ROOM.width / 2;
  const halfD = HK_OFFICE_ROOM.depth / 2;
  const sideCenterX = HK_SIDE_STRIP_PLAN_X - HK_OFFICE_ROOM.width / 2 + (22 - HK_SIDE_STRIP_PLAN_X) / 2;
  const y0 = officePlanYStart();
  const stripTop = y0;
  const areas: HkFunctionalArea[] = [
    {
      id: "open_plan",
      label: "Open plan",
      center: [-3.5, 0],
      size: [HK_SIDE_STRIP_PLAN_X - 1, HK_OFFICE_ROOM.depth - 2],
    },
  ];

  let cursor = stripTop;
  if (variant.meetingRooms >= 1) {
    const depth = variant.meetingRooms >= 2 ? 3 : 4;
    areas.push({
      id: "meeting_large",
      label: "Boardroom",
      center: [sideCenterX, cursor + depth / 2 - (y0 + HK_OFFICE_ROOM.depth / 2)],
      size: [6, depth],
    });
    cursor += depth;
    if (variant.meetingRooms >= 2) {
      areas.push({
        id: "meeting_small",
        label: "Meeting room",
        center: [8.5, stripTop + 1.5 - (y0 + HK_OFFICE_ROOM.depth / 2)],
        size: [3, 3],
      });
    }
  }

  const pantryDepth = variant.enlargedPantry ? 3.5 : 2.5;
  const mgrBand =
    (HK_OFFICE_ROOM.depth - (cursor - stripTop) - pantryDepth) / Math.max(variant.managerRooms, 1);
  for (let index = 0; index < variant.managerRooms; index += 1) {
    const centerY = cursor + mgrBand / 2 - (y0 + HK_OFFICE_ROOM.depth / 2);
    areas.push({
      id: `manager_${index + 1}`,
      label: `Manager ${index + 1}`,
      center: [sideCenterX, centerY],
      size: [5.5, mgrBand - 0.2],
    });
    cursor += mgrBand;
  }

  areas.push({
    id: "pantry",
    label: "Pantry",
    center: [sideCenterX, halfD - pantryDepth / 2 + 0.2],
    size: [6, pantryDepth],
  });

  areas.push({
    id: "copy",
    label: "Copy corner",
    center: [-halfW + 1.5, -halfD + 1.2],
    size: [2.5, 2],
  });

  return areas;
}

export function isHkBuildingId(buildingId: string): buildingId is HkBuildingId {
  return (BUILDING_IDS as readonly string[]).includes(buildingId);
}

export function hkVariantForBuilding(buildingId: string): HkBuildingVariant {
  if (isHkBuildingId(buildingId)) {
    return HK_BUILDING_VARIANTS[buildingId];
  }
  return HK_BUILDING_VARIANTS.hq;
}

export function hkRoomsForBuilding(_buildingId: string): {
  lobby_room: RoomDimensions;
  corridor_room: RoomDimensions;
  room: RoomDimensions;
} {
  return {
    lobby_room: { ...HK_LOBBY_ROOM },
    corridor_room: { ...HK_CORRIDOR_ROOM },
    room: { ...HK_OFFICE_ROOM },
  };
}

export function buildHkOfficeArchitecture(buildingId: string): OfficeArchitecture {
  const variant = hkVariantForBuilding(buildingId);
  return {
    freeform_enabled: true,
    floor_count: 1,
    walls: buildHkPartitionWalls(variant),
  };
}

export function applyHkOfficeTemplate(
  buildingId: string,
  raw?: Partial<OfficeVisualConfig>,
): Partial<OfficeVisualConfig> {
  const variant = hkVariantForBuilding(buildingId);
  const rooms = hkRoomsForBuilding(buildingId);
  return {
    ...raw,
    layout_template: HK_LAYOUT_TEMPLATE_ID,
    lobby_room: rooms.lobby_room,
    corridor_room: rooms.corridor_room,
    room: rooms.room,
    desk_style: raw?.desk_style ?? variant.deskStyle,
    has_plants: raw?.has_plants ?? true,
    has_whiteboard: raw?.has_whiteboard ?? variant.hasWhiteboard,
    has_lounge_seating: raw?.has_lounge_seating ?? variant.hasLoungeSeating,
    architecture: buildHkOfficeArchitecture(buildingId),
    desk_positions: [],
  };
}

export function isLegacySmallOffice(office: Partial<OfficeVisualConfig> | undefined): boolean {
  const width = office?.room?.width ?? 0;
  const deskCount =
    office?.furniture?.filter((item) => item.catalog_id.startsWith("desk_")).length ?? 0;
  const explicitArchitecture =
    office?.architecture?.freeform_enabled === true && (office.architecture.walls?.length ?? 0) > 0;
  if (explicitArchitecture) {
    return false;
  }
  if (office?.layout_template === HK_LAYOUT_TEMPLATE_ID && deskCount >= 48) {
    return false;
  }
  if (!office?.furniture || office.furniture.length === 0) {
    return true;
  }
  if (width < 12) {
    return true;
  }
  if (deskCount < 40) {
    return true;
  }
  return office.layout_template !== HK_LAYOUT_TEMPLATE_ID;
}