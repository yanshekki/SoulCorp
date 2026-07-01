import { layoutForBuilding } from "../data/interiorLayouts";
import { deskCatalogId, getCatalogEntry } from "../data/furnitureCatalog";
import { FURNITURE_CLEARANCE } from "./furnitureEditor";
import { BUILDING_DESKS } from "../data/worldLayout";
import type { FurnitureInstance, OfficeVisualConfig, RoomDimensions } from "../types/visualDesign";
import { DEFAULT_CORRIDOR_ROOM, DEFAULT_OFFICE_VISUAL } from "../types/visualDesign";
import { defaultBuildingForId, roomsFromBuilding, scaleFurnitureForGameRooms } from "./interiorScale";

function mergeRoomDimensions(
  saved: Partial<RoomDimensions> | undefined,
  defaults: RoomDimensions,
): RoomDimensions {
  return {
    width: saved?.width ?? defaults.width,
    depth: saved?.depth ?? defaults.depth,
    height: saved?.height ?? defaults.height,
  };
}

function roomFromLayout(
  lobby: [number, number],
  office: [number, number],
): Pick<OfficeVisualConfig, "lobby_room" | "corridor_room" | "room"> {
  return {
    lobby_room: { width: lobby[0], depth: lobby[1], height: 3.2 },
    corridor_room: { ...DEFAULT_CORRIDOR_ROOM },
    room: { width: office[0], depth: office[1], height: 3.2 },
  };
}

function legacyFurniture(
  office: OfficeVisualConfig,
  buildingId: string,
): FurnitureInstance[] {
  const items: FurnitureInstance[] = [];
  const layout = layoutForBuilding(buildingId);
  const rooms = roomFromLayout(layout.lobbySize, layout.officeSize);
  const deskPositions =
    office.desk_positions && office.desk_positions.length > 0
      ? office.desk_positions
      : BUILDING_DESKS[buildingId] ?? BUILDING_DESKS.hq;
  const catalogId = deskCatalogId(office.desk_style);

  deskPositions.forEach((pos, index) => {
    const deskEntry = getCatalogEntry(catalogId);
    const chairCatalogId = office.desk_style === "executive" ? "chair_executive" : "chair_office";
    const chairEntry = getCatalogEntry(chairCatalogId);
    const monitorEntry = getCatalogEntry("monitor");
    const deskDepth = deskEntry?.footprint[1] ?? 0.75;
    const chairDepth = chairEntry?.footprint[1] ?? 1.1;
    const deskWidth = deskEntry?.footprint[0] ?? 1.2;
    const monitorWidth = monitorEntry?.footprint[0] ?? 0.38;

    const deskId = `desk-${buildingId}-${index}`;
    items.push({
      id: deskId,
      catalog_id: catalogId,
      zone: "office",
      position: [pos[0], 0, pos[2]],
      rotation_y: 0,
    });
    items.push({
      id: `chair-${buildingId}-${index}`,
      catalog_id: chairCatalogId,
      zone: "office",
      position: [
        pos[0],
        0,
        pos[2] + deskDepth / 2 + chairDepth / 2 + FURNITURE_CLEARANCE,
      ],
      rotation_y: Math.PI,
    });
    items.push({
      id: `monitor-${buildingId}-${index}`,
      catalog_id: "monitor",
      zone: "office",
      position: [
        pos[0] + deskWidth / 2 + monitorWidth / 2 + FURNITURE_CLEARANCE,
        0.72,
        pos[2],
      ],
      rotation_y: 0,
    });
  });

  items.push({
    id: `reception-${buildingId}`,
    catalog_id: "reception_desk",
    zone: "lobby",
    position: [layout.receptionDesk[0], 0, layout.receptionDesk[2]],
    rotation_y: 0,
  });

  const officeDepth = rooms.room.depth;
  if (office.has_whiteboard) {
    items.push({
      id: `whiteboard-${buildingId}`,
      catalog_id: "whiteboard",
      zone: "office",
      position: [-1.5, 1.35, -officeDepth / 2 + 0.12],
      rotation_y: 0,
    });
  }

  if (office.has_plants) {
    const halfW = office.room.width * 0.38;
    const halfD = office.room.depth * 0.32;
    for (const [px, pz] of [
      [-halfW, halfD],
      [halfW * 0.92, halfD * 0.88],
    ] as const) {
      items.push({
        id: `plant-${buildingId}-${px}`,
        catalog_id: "plant_ficus",
        zone: "lobby",
        position: [px, 0, pz],
        rotation_y: 0,
      });
    }
  }

  if (office.has_lounge_seating) {
    const sofaEntry = getCatalogEntry("sofa");
    const coffeeEntry = getCatalogEntry("coffee_table");
    const sofaDepth = sofaEntry?.footprint[1] ?? 0.75;
    const coffeeDepth = coffeeEntry?.footprint[1] ?? 0.5;
    const loungeZ = 1.25;
    items.push({
      id: `sofa-${buildingId}`,
      catalog_id: "sofa",
      zone: "lobby",
      position: [1.7, 0, loungeZ],
      rotation_y: 0,
    });
    items.push({
      id: `coffee-table-${buildingId}`,
      catalog_id: "coffee_table",
      zone: "lobby",
      position: [
        1.7,
        0,
        loungeZ + sofaDepth / 2 + coffeeDepth / 2 + FURNITURE_CLEARANCE,
      ],
      rotation_y: 0,
    });
  }

  items.push({
    id: `water-cooler-${buildingId}`,
    catalog_id: "water_cooler",
    zone: "lobby",
    position: [-2.1, 0, 0.9],
    rotation_y: 0,
  });

  return items;
}

/** Ensures room dimensions and furniture[] exist; migrates legacy flags/positions. */
export function normalizeOfficeVisual(
  raw: Partial<OfficeVisualConfig> | undefined,
  buildingId: string,
): OfficeVisualConfig {
  const building = defaultBuildingForId(buildingId);
  const rooms = roomsFromBuilding(building);
  const base: OfficeVisualConfig = {
    ...DEFAULT_OFFICE_VISUAL,
    ...raw,
    lobby_room: mergeRoomDimensions(raw?.lobby_room, rooms.lobby_room),
    corridor_room: mergeRoomDimensions(raw?.corridor_room, rooms.corridor_room),
    room: mergeRoomDimensions(raw?.room, rooms.room),
  };

  if (!base.furniture || base.furniture.length === 0) {
    base.furniture = legacyFurniture(base, buildingId);
  } else {
    base.furniture = scaleFurnitureForGameRooms(base.furniture, buildingId, base);
  }

  return base;
}

export function deskPositionsFromOffice(office: OfficeVisualConfig): [number, number, number][] {
  const desks = office.furniture.filter((item) => item.catalog_id.startsWith("desk_"));
  if (desks.length > 0) {
    return desks.map((item) => item.position);
  }
  if (office.desk_positions && office.desk_positions.length > 0) {
    return office.desk_positions;
  }
  return [];
}

export function normalizeVisualDesignOffices(
  offices: Record<string, OfficeVisualConfig | Partial<OfficeVisualConfig>>,
): Record<string, OfficeVisualConfig> {
  const result: Record<string, OfficeVisualConfig> = {};
  for (const [id, office] of Object.entries(offices)) {
    result[id] = normalizeOfficeVisual(office, id);
  }
  return result;
}

export function defaultRoomsForBuilding(buildingId: string): {
  lobby_room: RoomDimensions;
  corridor_room: RoomDimensions;
  room: RoomDimensions;
} {
  return roomsFromBuilding(defaultBuildingForId(buildingId));
}