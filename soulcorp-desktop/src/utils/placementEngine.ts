/**
 * Unified placement API for 2D floor plan and 3D interior editing.
 * Single source of truth for snap, collision, zone clamp, and coordinate transforms.
 */
import { getCatalogEntry } from "../data/furnitureCatalog";
import type {
  FurnitureInstance,
  InteriorZone,
  OfficeVisualConfig,
  RoomDimensions,
} from "../types/visualDesign";
import {
  clampToZone,
  collidesInZone,
  isFurniturePlacementValid,
  itemToPlanCoords,
  newFurnitureId,
  planCoordsToItemPosition,
  snapRotation,
  type FloorPlanLayout,
  type FloorPlanZone,
  zoneAtPlanPoint,
  zoneDimensions,
} from "./furnitureEditor";

export {
  FURNITURE_CLEARANCE,
  STUDIO_SNAP_GRID,
  floorPlanLayout,
  isFurniturePlacementValid,
  itemToPlanCoords,
  planCoordsToItemPosition,
  pointInFurniturePlan,
  zoneAtPlanPoint,
  zoneDimensions,
  type FloorPlanLayout,
  type FloorPlanZone,
} from "./furnitureEditor";

export interface PlacementResult {
  ok: boolean;
  item?: FurnitureInstance;
  reason?: "no_catalog" | "collision" | "out_of_zone";
}

export function createPlacementCandidate(
  catalogId: string,
  buildingId: string,
  zone: InteriorZone,
  position: [number, number, number],
  rotation_y = 0,
): FurnitureInstance | null {
  if (!getCatalogEntry(catalogId)) {
    return null;
  }
  return {
    id: newFurnitureId(catalogId, buildingId),
    catalog_id: catalogId,
    zone,
    position,
    rotation_y,
  };
}

export function validatePlacement(
  candidate: FurnitureInstance,
  office: OfficeVisualConfig,
  others: FurnitureInstance[],
): PlacementResult {
  const entry = getCatalogEntry(candidate.catalog_id);
  if (!entry) {
    return { ok: false, reason: "no_catalog" };
  }
  const room = zoneDimensions(office, candidate.zone);
  if (!isFurniturePlacementValid(candidate, others, entry.footprint, room)) {
    const clamped = clampToZone(candidate, entry.footprint, room);
    const blocked = collidesInZone(
      { ...candidate, position: clamped },
      others,
      entry.footprint,
    );
    return { ok: false, reason: blocked ? "collision" : "out_of_zone" };
  }
  const [x, y, z] = clampToZone(candidate, entry.footprint, room);
  return { ok: true, item: { ...candidate, position: [x, y, z] } };
}

export function placeFromPlanPoint(
  catalogId: string,
  buildingId: string,
  office: OfficeVisualConfig,
  layout: FloorPlanLayout,
  planX: number,
  planY: number,
): PlacementResult {
  const zone = zoneAtPlanPoint(layout, planX, planY);
  if (!zone) {
    return { ok: false, reason: "out_of_zone" };
  }
  const position = planCoordsToItemPosition(zone, planX, planY);
  const candidate = createPlacementCandidate(catalogId, buildingId, zone.id, position);
  if (!candidate) {
    return { ok: false, reason: "no_catalog" };
  }
  return validatePlacement(candidate, office, office.furniture);
}

export function moveInstance(
  item: FurnitureInstance,
  office: OfficeVisualConfig,
  nextPosition: [number, number, number],
): PlacementResult {
  const others = office.furniture.filter((entry) => entry.id !== item.id);
  return validatePlacement({ ...item, position: nextPosition }, office, others);
}

export function rotateInstance(
  item: FurnitureInstance,
  office: OfficeVisualConfig,
  stepRadians = Math.PI / 2,
): PlacementResult {
  const entry = getCatalogEntry(item.catalog_id);
  if (!entry?.rotatable) {
    return { ok: false, reason: "no_catalog" };
  }
  const others = office.furniture.filter((entry) => entry.id !== item.id);
  return validatePlacement(
    { ...item, rotation_y: snapRotation(item.rotation_y + stepRadians) },
    office,
    others,
  );
}

export function planPointFromWorld(
  item: FurnitureInstance,
  layout: FloorPlanLayout,
): { x: number; y: number } | null {
  return itemToPlanCoords(item, layout);
}

export function worldFromPlanPoint(
  zone: FloorPlanZone,
  planX: number,
  planY: number,
): [number, number, number] {
  return planCoordsToItemPosition(zone, planX, planY);
}

export function roomForZone(
  office: OfficeVisualConfig,
  zone: InteriorZone,
): RoomDimensions {
  return zoneDimensions(office, zone);
}