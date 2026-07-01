import { deskCatalogId, getCatalogEntry } from "../data/furnitureCatalog";
import {
  hkFunctionalAreas,
  hkVariantForBuilding,
  type HkFunctionalArea,
} from "../data/hkOfficeLayouts";
import type { FurnitureInstance, InteriorZone, OfficeVisualConfig } from "../types/visualDesign";
import { FURNITURE_CLEARANCE } from "./furnitureEditor";

const OPEN_PLAN_COLS = 10;
const OPEN_PLAN_ROWS = 5;
const COL_PITCH = 1.45;
const ROW_PITCH = 2.65;

function pushDeskSet(
  items: FurnitureInstance[],
  buildingId: string,
  zone: InteriorZone,
  catalogId: string,
  chairId: string,
  x: number,
  z: number,
  index: number,
  withMonitor = true,
): void {
  const deskEntry = getCatalogEntry(catalogId);
  const chairEntry = getCatalogEntry(chairId);
  const monitorEntry = getCatalogEntry("monitor");
  const deskDepth = deskEntry?.footprint[1] ?? 0.75;
  const chairDepth = chairEntry?.footprint[1] ?? 0.45;
  const deskWidth = deskEntry?.footprint[0] ?? 1.2;
  const monitorWidth = monitorEntry?.footprint[0] ?? 0.38;

  const deskId = `desk-${buildingId}-${index}`;
  items.push({
    id: deskId,
    catalog_id: catalogId,
    zone,
    position: [x, 0, z],
    rotation_y: 0,
  });
  items.push({
    id: `chair-${buildingId}-${index}`,
    catalog_id: chairId,
    zone,
    position: [x, 0, z + deskDepth / 2 + chairDepth / 2 + FURNITURE_CLEARANCE],
    rotation_y: Math.PI,
  });
  if (withMonitor) {
    items.push({
      id: `monitor-${buildingId}-${index}`,
      catalog_id: "monitor",
      zone,
      position: [x + deskWidth / 2 + monitorWidth / 2 + FURNITURE_CLEARANCE, 0.72, z],
      rotation_y: 0,
    });
  }
}

function generateOpenPlanDesks(
  buildingId: string,
  office: OfficeVisualConfig,
  openArea: HkFunctionalArea,
): FurnitureInstance[] {
  const items: FurnitureInstance[] = [];
  const catalogId = deskCatalogId(office.desk_style);
  const chairId = office.desk_style === "executive" ? "chair_executive" : "chair_office";
  const [cx, cz] = openArea.center;
  const halfCols = (OPEN_PLAN_COLS - 1) / 2;
  const halfRows = (OPEN_PLAN_ROWS - 1) / 2;
  let index = 0;

  for (let row = 0; row < OPEN_PLAN_ROWS; row += 1) {
    for (let col = 0; col < OPEN_PLAN_COLS; col += 1) {
      const x = cx - halfCols * COL_PITCH + col * COL_PITCH;
      const z = cz - halfRows * ROW_PITCH + row * ROW_PITCH;
      const withMonitor = office.desk_style !== "lounge" || col % 2 === 0;
      pushDeskSet(items, buildingId, "office", catalogId, chairId, x, z, index, withMonitor);
      index += 1;
    }
  }

  return items;
}

function addManagerRoom(
  items: FurnitureInstance[],
  buildingId: string,
  area: HkFunctionalArea,
  roomIndex: number,
): void {
  const [x, z] = area.center;
  pushDeskSet(items, buildingId, "office", "desk_executive", "chair_executive", x, z - 0.3, 1000 + roomIndex);
  items.push({
    id: `bookshelf-mgr-${buildingId}-${roomIndex}`,
    catalog_id: "bookshelf",
    zone: "office",
    position: [x + 1.8, 0, z + 0.8],
    rotation_y: 0,
  });
  items.push({
    id: `plant-mgr-${buildingId}-${roomIndex}`,
    catalog_id: "plant_potted",
    zone: "office",
    position: [x - 1.6, 0, z + 1],
    rotation_y: 0,
  });
}

function addMeetingRoom(
  items: FurnitureInstance[],
  buildingId: string,
  area: HkFunctionalArea,
  roomIndex: number,
): void {
  const [x, z] = area.center;
  items.push({
    id: `whiteboard-meet-${buildingId}-${roomIndex}`,
    catalog_id: "whiteboard",
    zone: "office",
    position: [x, 1.35, z - area.size[1] / 2 + 0.2],
    rotation_y: 0,
  });
  for (let seat = 0; seat < 6; seat += 1) {
    const sx = x - 2 + (seat % 3) * 2;
    const sz = z + (seat < 3 ? 0.6 : -0.8);
    items.push({
      id: `meet-chair-${buildingId}-${roomIndex}-${seat}`,
      catalog_id: "chair_office",
      zone: "office",
      position: [sx, 0, sz],
      rotation_y: seat < 3 ? Math.PI : 0,
    });
  }
  pushDeskSet(items, buildingId, "office", "desk_open", "chair_office", x, z, 2000 + roomIndex, false);
  items.push({
    id: `meet-table-${buildingId}-${roomIndex}`,
    catalog_id: "coffee_table",
    zone: "office",
    position: [x, 0, z],
    rotation_y: 0,
  });
}

function addPantry(items: FurnitureInstance[], buildingId: string, area: HkFunctionalArea): void {
  const [x, z] = area.center;
  items.push({
    id: `water-cooler-${buildingId}`,
    catalog_id: "water_cooler",
    zone: "office",
    position: [x - 1.2, 0, z],
    rotation_y: 0,
  });
  items.push({
    id: `coffee-pantry-${buildingId}`,
    catalog_id: "coffee_table",
    zone: "office",
    position: [x + 0.8, 0, z - 0.3],
    rotation_y: 0,
  });
  items.push({
    id: `cabinet-pantry-${buildingId}`,
    catalog_id: "filing_cabinet",
    zone: "office",
    position: [x + 1.8, 0, z + 0.6],
    rotation_y: 0,
  });
  items.push({
    id: `plant-pantry-${buildingId}`,
    catalog_id: "plant_ficus",
    zone: "office",
    position: [x - 2, 0, z + 0.5],
    rotation_y: 0,
  });
}

function addCopyCorner(items: FurnitureInstance[], buildingId: string, area: HkFunctionalArea): void {
  const [x, z] = area.center;
  items.push({
    id: `copy-cabinet-${buildingId}`,
    catalog_id: "filing_cabinet",
    zone: "office",
    position: [x, 0, z],
    rotation_y: 0,
  });
  items.push({
    id: `copy-cabinet-2-${buildingId}`,
    catalog_id: "filing_cabinet",
    zone: "office",
    position: [x + 0.7, 0, z + 0.4],
    rotation_y: 0,
  });
}

function addReception(items: FurnitureInstance[], buildingId: string, office: OfficeVisualConfig): void {
  const lobbyHalfW = office.lobby_room.width / 2;
  const lobbyHalfD = office.lobby_room.depth / 2;

  items.push({
    id: `reception-${buildingId}`,
    catalog_id: "reception_desk",
    zone: "lobby",
    position: [0, 0, lobbyHalfD - 1.1],
    rotation_y: 0,
  });
  items.push({
    id: `rug-round-${buildingId}`,
    catalog_id: "rug_round",
    zone: "lobby",
    position: [0, 0, lobbyHalfD - 2.2],
    rotation_y: 0,
  });
  items.push({
    id: `wall-poster-${buildingId}`,
    catalog_id: "wall_poster",
    zone: "lobby",
    position: [lobbyHalfW * 0.55, 1.35, -lobbyHalfD + 0.15],
    rotation_y: 0,
  });

  for (const [index, px] of [-1.8, 1.9].entries()) {
    items.push({
      id: `lobby-plant-${buildingId}-${index}`,
      catalog_id: "plant_ficus",
      zone: "lobby",
      position: [px, 0, 0.8],
      rotation_y: 0,
    });
  }

  if (office.has_lounge_seating) {
    items.push({
      id: `sofa-${buildingId}`,
      catalog_id: "sofa",
      zone: "lobby",
      position: [2.2, 0, -0.4],
      rotation_y: -Math.PI / 2,
    });
    items.push({
      id: `coffee-lobby-${buildingId}`,
      catalog_id: "coffee_table",
      zone: "lobby",
      position: [1.2, 0, -0.4],
      rotation_y: 0,
    });
  }
}

function addEngineeringExtras(items: FurnitureInstance[], buildingId: string, office: OfficeVisualConfig): void {
  const halfW = office.room.width / 2;
  const halfD = office.room.depth / 2;
  items.push({
    id: `server-rack-${buildingId}`,
    catalog_id: "server_rack",
    zone: "office",
    position: [-halfW + 1, 0, -halfD + 1.2],
    rotation_y: 0,
  });
  items.push({
    id: `whiteboard-eng-${buildingId}`,
    catalog_id: "whiteboard",
    zone: "office",
    position: [-4, 1.35, -halfD + 0.15],
    rotation_y: 0,
  });
  for (let index = 0; index < 8; index += 1) {
    const desk = items.find((item) => item.id === `desk-${buildingId}-${index}`);
    if (desk) {
      items.push({
        id: `laptop-${buildingId}-${index}`,
        catalog_id: "laptop",
        zone: "office",
        position: [desk.position[0] - 0.35, 0.74, desk.position[2]],
        rotation_y: 0,
      });
    }
  }
}

function addParkExtras(items: FurnitureInstance[], buildingId: string): void {
  items.push({
    id: `sofa-corner-${buildingId}`,
    catalog_id: "sofa_corner",
    zone: "office",
    position: [-6, 0, 5],
    rotation_y: 0,
  });
  items.push({
    id: `floor-lamp-${buildingId}`,
    catalog_id: "floor_lamp",
    zone: "office",
    position: [-4.5, 0, 5.5],
    rotation_y: 0,
  });
}

function addOfficeDecor(items: FurnitureInstance[], buildingId: string, office: OfficeVisualConfig): void {
  const halfW = office.room.width / 2;
  const halfD = office.room.depth / 2;
  items.push({
    id: `wall-canvas-${buildingId}`,
    catalog_id: "wall_canvas",
    zone: "office",
    position: [halfW * 0.35, 1.4, -halfD + 0.12],
    rotation_y: 0,
  });
  items.push({
    id: `rug-runner-${buildingId}`,
    catalog_id: "rug_runner",
    zone: "office",
    position: [-2, 0, 0.5],
    rotation_y: 0,
  });
  if (office.has_whiteboard) {
    const hasMeetBoard = items.some((item) => item.catalog_id === "whiteboard" && item.zone === "office");
    if (!hasMeetBoard) {
      items.push({
        id: `whiteboard-${buildingId}`,
        catalog_id: "whiteboard",
        zone: "office",
        position: [-halfW + 2, 1.35, -halfD + 0.12],
        rotation_y: 0,
      });
    }
  }
}

export function generateHkOfficeFurniture(
  buildingId: string,
  office: OfficeVisualConfig,
): FurnitureInstance[] {
  const variant = hkVariantForBuilding(buildingId);
  const areas = hkFunctionalAreas(variant);
  const items: FurnitureInstance[] = [];

  addReception(items, buildingId, office);

  const openArea = areas.find((area) => area.id === "open_plan");
  if (openArea) {
    items.push(...generateOpenPlanDesks(buildingId, office, openArea));
  }

  for (const area of areas) {
    if (area.id.startsWith("manager_")) {
      const roomIndex = Number.parseInt(area.id.split("_")[1] ?? "1", 10);
      addManagerRoom(items, buildingId, area, roomIndex);
    } else if (area.id.startsWith("meeting_")) {
      const roomIndex = area.id === "meeting_large" ? 1 : 2;
      addMeetingRoom(items, buildingId, area, roomIndex);
    } else if (area.id === "pantry") {
      addPantry(items, buildingId, area);
    } else if (area.id === "copy") {
      addCopyCorner(items, buildingId, area);
    }
  }

  if (variant.hasServerCorner) {
    addEngineeringExtras(items, buildingId, office);
  }
  if (variant.enlargedPantry) {
    addParkExtras(items, buildingId);
  }

  addOfficeDecor(items, buildingId, office);
  return items;
}

export function countDesksInFurniture(furniture: FurnitureInstance[]): number {
  return furniture.filter((item) => item.catalog_id.startsWith("desk_")).length;
}