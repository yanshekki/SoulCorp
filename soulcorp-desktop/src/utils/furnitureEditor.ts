import { getCatalogEntry } from "../data/furnitureCatalog";
import type {
  FurnitureInstance,
  InteriorZone,
  OfficeVisualConfig,
  RoomDimensions,
} from "../types/visualDesign";

export const STUDIO_SNAP_GRID = 0.5;
/** Floor plan SVG fine grid (metres). */
export const FLOOR_PLAN_FINE_GRID = 0.25;
/** Floor plan SVG coarse grid (metres). */
export const FLOOR_PLAN_COARSE_GRID = 1;
/** Minimum gap between furniture footprints in the design studio (metres). */
export const FURNITURE_CLEARANCE = 0.08;

export interface FloorPlanZone {
  id: InteriorZone;
  label: string;
  x: number;
  y: number;
  width: number;
  depth: number;
}

export interface FloorPlanLayout {
  maxWidth: number;
  totalDepth: number;
  zones: FloorPlanZone[];
}

export function snapScalar(value: number, grid = STUDIO_SNAP_GRID): number {
  return Math.round(value / grid) * grid;
}

export function snapPosition(
  x: number,
  z: number,
  grid = STUDIO_SNAP_GRID,
): [number, number] {
  return [snapScalar(x, grid), snapScalar(z, grid)];
}

export function snapRotation(rotation: number): number {
  const step = Math.PI / 4;
  return Math.round(rotation / step) * step;
}

export function rotatedFootprint(
  footprint: [number, number],
  rotation: number,
): [number, number] {
  const cos = Math.abs(Math.cos(rotation));
  const sin = Math.abs(Math.sin(rotation));
  return [footprint[0] * cos + footprint[1] * sin, footprint[0] * sin + footprint[1] * cos];
}

export function furnitureAabb(
  item: FurnitureInstance,
  footprint: [number, number],
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const [w, d] = rotatedFootprint(footprint, item.rotation_y);
  const halfW = w / 2;
  const halfD = d / 2;
  const [x, , z] = item.position;
  return {
    minX: x - halfW,
    maxX: x + halfW,
    minZ: z - halfD,
    maxZ: z + halfD,
  };
}

export function obbCorners(
  x: number,
  z: number,
  footprint: [number, number],
  rotation: number,
  clearance = 0,
): [number, number][] {
  const width = footprint[0] + clearance * 2;
  const depth = footprint[1] + clearance * 2;
  const halfW = width / 2;
  const halfD = depth / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const local: [number, number][] = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ];
  return local.map(([lx, lz]) => [x + lx * cos - lz * sin, z + lx * sin + lz * cos]);
}

function projectOntoAxis(
  corners: [number, number][],
  axis: [number, number],
): [number, number] {
  const [axisX, axisZ] = axis;
  let min = Infinity;
  let max = -Infinity;
  for (const [x, z] of corners) {
    const projection = x * axisX + z * axisZ;
    min = Math.min(min, projection);
    max = Math.max(max, projection);
  }
  return [min, max];
}

function separationAxes(corners: [number, number][]): [number, number][] {
  const axes: [number, number][] = [];
  for (let index = 0; index < 4; index += 1) {
    const [x1, z1] = corners[index];
    const [x2, z2] = corners[(index + 1) % 4];
    const edgeX = x2 - x1;
    const edgeZ = z2 - z1;
    const axis: [number, number] = [-edgeZ, edgeX];
    const length = Math.hypot(axis[0], axis[1]);
    if (length < 1e-9) {
      continue;
    }
    axes.push([axis[0] / length, axis[1] / length]);
  }
  return axes;
}

function obbOverlap(
  cornersA: [number, number][],
  cornersB: [number, number][],
): boolean {
  const axes = [...separationAxes(cornersA), ...separationAxes(cornersB)];
  for (const axis of axes) {
    const [minA, maxA] = projectOntoAxis(cornersA, axis);
    const [minB, maxB] = projectOntoAxis(cornersB, axis);
    if (maxA <= minB || maxB <= minA) {
      return false;
    }
  }
  return true;
}

export function furnitureObbOverlaps(
  a: FurnitureInstance,
  aFootprint: [number, number],
  b: FurnitureInstance,
  bFootprint: [number, number],
  clearance = FURNITURE_CLEARANCE,
): boolean {
  const aCorners = obbCorners(a.position[0], a.position[2], aFootprint, a.rotation_y, clearance);
  const bCorners = obbCorners(b.position[0], b.position[2], bFootprint, b.rotation_y, clearance);
  return obbOverlap(aCorners, bCorners);
}

function isPassThroughDecor(catalogId: string): boolean {
  const entry = getCatalogEntry(catalogId);
  return entry?.defaultProps?.wallMount === true || entry?.defaultProps?.floorDecal === true;
}

export function collidesInZone(
  candidate: FurnitureInstance,
  others: FurnitureInstance[],
  footprint: [number, number],
  clearance = FURNITURE_CLEARANCE,
): boolean {
  if (isPassThroughDecor(candidate.catalog_id)) {
    return false;
  }
  return others.some((other) => {
    if (other.id === candidate.id || other.zone !== candidate.zone) {
      return false;
    }
    if (isPassThroughDecor(other.catalog_id)) {
      return false;
    }
    const entry = getCatalogEntry(other.catalog_id);
    if (!entry) {
      return false;
    }
    return furnitureObbOverlaps(candidate, footprint, other, entry.footprint, clearance);
  });
}

export function isFurniturePlacementValid(
  candidate: FurnitureInstance,
  others: FurnitureInstance[],
  footprint: [number, number],
  room: RoomDimensions,
): boolean {
  const [x, y, z] = clampToZone(candidate, footprint, room);
  const clamped = { ...candidate, position: [x, y, z] as [number, number, number] };
  return !collidesInZone(clamped, others, footprint);
}

export function pointInFurniturePlan(
  planX: number,
  planY: number,
  item: FurnitureInstance,
  footprint: [number, number],
  zone: FloorPlanZone,
): boolean {
  const centerX = zone.x + zone.width / 2 + item.position[0];
  const centerZ = zone.y + zone.depth / 2 + item.position[2];
  const dx = planX - centerX;
  const dz = planY - centerZ;
  const cos = Math.cos(-item.rotation_y);
  const sin = Math.sin(-item.rotation_y);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const halfW = footprint[0] / 2;
  const halfD = footprint[1] / 2;
  return Math.abs(localX) <= halfW && Math.abs(localZ) <= halfD;
}

export function clampToZone(
  item: FurnitureInstance,
  footprint: [number, number],
  room: RoomDimensions,
): [number, number, number] {
  const [w, d] = rotatedFootprint(footprint, item.rotation_y);
  const halfW = room.width / 2 - w / 2 - 0.1;
  const halfD = room.depth / 2 - d / 2 - 0.1;
  const [x, y, z] = item.position;
  return [
    Math.max(-halfW, Math.min(halfW, x)),
    y,
    Math.max(-halfD, Math.min(halfD, z)),
  ];
}

export function floorPlanLayout(office: OfficeVisualConfig): FloorPlanLayout {
  const lobby = office.lobby_room;
  const corridor = office.corridor_room;
  const room = office.room;
  const maxWidth = Math.max(lobby.width, corridor.width, room.width);
  const totalDepth = lobby.depth + corridor.depth + room.depth;

  let y = 0;
  const zones: FloorPlanZone[] = [
    {
      id: "lobby",
      label: "Lobby",
      x: (maxWidth - lobby.width) / 2,
      y,
      width: lobby.width,
      depth: lobby.depth,
    },
    {
      id: "corridor",
      label: "Corridor",
      x: (maxWidth - corridor.width) / 2,
      y: (y += lobby.depth),
      width: corridor.width,
      depth: corridor.depth,
    },
    {
      id: "office",
      label: "Office",
      x: (maxWidth - room.width) / 2,
      y: (y += corridor.depth),
      width: room.width,
      depth: room.depth,
    },
  ];

  return { maxWidth, totalDepth, zones };
}

export function zoneDimensions(
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

export function itemToPlanCoords(
  item: FurnitureInstance,
  layout: FloorPlanLayout,
): { x: number; y: number } | null {
  const zone = layout.zones.find((entry) => entry.id === item.zone);
  if (!zone) {
    return null;
  }
  return {
    x: zone.x + zone.width / 2 + item.position[0],
    y: zone.y + zone.depth / 2 + item.position[2],
  };
}

export function planCoordsToItemPosition(
  zone: FloorPlanZone,
  planX: number,
  planY: number,
  grid = STUDIO_SNAP_GRID,
): [number, number, number] {
  const [x, z] = snapPosition(planX - (zone.x + zone.width / 2), planY - (zone.y + zone.depth / 2), grid);
  return [x, 0, z];
}

export function newFurnitureId(catalogId: string, buildingId: string): string {
  const nonce = Math.random().toString(36).slice(2, 8);
  return `${catalogId}-${buildingId}-${Date.now().toString(36)}-${nonce}`;
}

export function zoneAtPlanPoint(
  layout: FloorPlanLayout,
  planX: number,
  planY: number,
): FloorPlanZone | null {
  return (
    layout.zones.find(
      (zone) =>
        planX >= zone.x &&
        planX <= zone.x + zone.width &&
        planY >= zone.y &&
        planY <= zone.y + zone.depth,
    ) ?? null
  );
}