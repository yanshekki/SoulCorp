import { getCatalogEntry } from "../data/furnitureCatalog";
import type { InteriorZone, OfficeVisualConfig } from "../types/visualDesign";
import { floorPlanLayout, furnitureAabb, zoneDimensions } from "./furnitureEditor";
import { carveWalkableDisc, createNavGrid, fillRectBlocked, type NavGrid } from "./navGrid";

const WALKABLE_CATALOG = new Set([
  "chair_office",
  "chair_executive",
  "plant_ficus",
  "plant_potted",
  "floor_lamp",
]);

export function buildOfficeZoneNavGrid(
  office: OfficeVisualConfig,
  zone: InteriorZone,
  cellSize = 0.5,
): NavGrid {
  const room = zoneDimensions(office, zone);
  const width = Math.ceil(room.width / cellSize);
  const height = Math.ceil(room.depth / cellSize);
  const grid = createNavGrid(-room.width / 2, -room.depth / 2, width, height, cellSize, true);

  const furniture = office.furniture.filter((item) => item.zone === zone);
  for (const item of furniture) {
    const entry = getCatalogEntry(item.catalog_id);
    if (!entry || WALKABLE_CATALOG.has(item.catalog_id)) {
      continue;
    }
    const bounds = furnitureAabb(item, entry.footprint);
    fillRectBlocked(grid, bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ);
  }

  carveWalkableDisc(grid, 0, 0, 0.8);
  return grid;
}

export function buildOfficeNavGrids(office: OfficeVisualConfig): Record<InteriorZone, NavGrid> {
  floorPlanLayout(office);
  return {
    lobby: buildOfficeZoneNavGrid(office, "lobby"),
    corridor: buildOfficeZoneNavGrid(office, "corridor"),
    office: buildOfficeZoneNavGrid(office, "office"),
  };
}