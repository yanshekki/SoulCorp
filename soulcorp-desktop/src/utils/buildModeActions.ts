import { getCatalogEntry } from "../data/furnitureCatalog";
import type { FurnitureInstance, InteriorZone, OfficeVisualConfig } from "../types/visualDesign";
import {
  clampToZone,
  collidesInZone,
  newFurnitureId,
  snapPosition,
  snapRotation,
  zoneDimensions,
} from "./furnitureEditor";

export function placeFurniture(
  office: OfficeVisualConfig,
  buildingId: string,
  catalogId: string,
  zone: InteriorZone,
  localPosition: [number, number, number],
): FurnitureInstance[] | null {
  const entry = getCatalogEntry(catalogId);
  if (!entry) {
    return null;
  }
  const [x, z] = snapPosition(localPosition[0], localPosition[2]);
  const candidate: FurnitureInstance = {
    id: newFurnitureId(catalogId, buildingId),
    catalog_id: catalogId,
    zone,
    position: [x, 0, z],
    rotation_y: 0,
  };
  const room = zoneDimensions(office, zone);
  const [cx, cy, cz] = clampToZone(candidate, entry.footprint, room);
  const clamped = { ...candidate, position: [cx, cy, cz] as [number, number, number] };
  if (collidesInZone(clamped, office.furniture, entry.footprint)) {
    return null;
  }
  return [...office.furniture, clamped];
}

export function moveFurniture(
  office: OfficeVisualConfig,
  furnitureId: string,
  localPosition: [number, number, number],
): FurnitureInstance[] | null {
  const target = office.furniture.find((item) => item.id === furnitureId);
  if (!target) {
    return null;
  }
  const entry = getCatalogEntry(target.catalog_id);
  if (!entry) {
    return null;
  }
  const [x, z] = snapPosition(localPosition[0], localPosition[2]);
  const candidate = { ...target, position: [x, target.position[1], z] as [number, number, number] };
  const room = zoneDimensions(office, target.zone);
  const [cx, cy, cz] = clampToZone(candidate, entry.footprint, room);
  const clamped = { ...candidate, position: [cx, cy, cz] as [number, number, number] };
  const others = office.furniture.filter((item) => item.id !== furnitureId);
  if (collidesInZone(clamped, others, entry.footprint)) {
    return null;
  }
  return office.furniture.map((item) => (item.id === furnitureId ? clamped : item));
}

export function rotateFurniture(
  office: OfficeVisualConfig,
  furnitureId: string,
): FurnitureInstance[] | null {
  const target = office.furniture.find((item) => item.id === furnitureId);
  if (!target) {
    return null;
  }
  const entry = getCatalogEntry(target.catalog_id);
  if (!entry?.rotatable) {
    return null;
  }
  const rotated = {
    ...target,
    rotation_y: snapRotation(target.rotation_y + Math.PI / 2),
  };
  const room = zoneDimensions(office, target.zone);
  const [cx, cy, cz] = clampToZone(rotated, entry.footprint, room);
  const clamped = { ...rotated, position: [cx, cy, cz] as [number, number, number] };
  const others = office.furniture.filter((item) => item.id !== furnitureId);
  if (collidesInZone(clamped, others, entry.footprint)) {
    return null;
  }
  return office.furniture.map((item) => (item.id === furnitureId ? clamped : item));
}

export function deleteFurniture(
  office: OfficeVisualConfig,
  furnitureId: string,
): FurnitureInstance[] {
  return office.furniture.filter((item) => item.id !== furnitureId);
}