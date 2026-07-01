import { INITIAL_BUILDINGS } from "../data/initialWorld";
import { BUILDING_ENTRANCES, WORLD_PROPS } from "../data/worldLayout";
import type { Building } from "../types/world";
import {
  carveWalkableDisc,
  createNavGrid,
  fillRectBlocked,
  type NavGrid,
} from "./navGrid";

const CELL_SIZE = 0.5;
const ORIGIN_X = -12;
const ORIGIN_Z = -11;
const GRID_WIDTH = 52;
const GRID_HEIGHT = 44;

let cachedSignature = "";
let cachedGrid: NavGrid | null = null;

function buildingSignature(buildings: Building[]): string {
  return buildings
    .map((building) => `${building.id}:${building.position.join(",")}:${building.size.join(",")}`)
    .join("|");
}

export function buildCampusNavGrid(buildings: Building[] = INITIAL_BUILDINGS): NavGrid {
  const grid = createNavGrid(ORIGIN_X, ORIGIN_Z, GRID_WIDTH, GRID_HEIGHT, CELL_SIZE, true);

  for (const building of buildings) {
    const [bx, , bz] = building.position;
    const [width, , depth] = building.size;
    const margin = 0.2;
    fillRectBlocked(
      grid,
      bx - width / 2 - margin,
      bx + width / 2 + margin,
      bz - depth / 2 - margin,
      bz + depth / 2 + margin,
    );
  }

  for (const entrance of Object.values(BUILDING_ENTRANCES)) {
    carveWalkableDisc(grid, entrance[0], entrance[2], 1.1);
  }

  for (const prop of WORLD_PROPS) {
    const radius = prop.type === "tree" ? 0.9 : 0.55;
    fillRectBlocked(
      grid,
      prop.position[0] - radius,
      prop.position[0] + radius,
      prop.position[2] - radius,
      prop.position[2] + radius,
    );
  }

  carveWalkableDisc(grid, 0, -3.5, 1.4);
  carveWalkableDisc(grid, 0, 3.5, 1.2);
  carveWalkableDisc(grid, -3.5, 0, 1.0);
  carveWalkableDisc(grid, 3.5, 0, 1.0);

  return grid;
}

export function getCampusNavGrid(buildings: Building[] = INITIAL_BUILDINGS): NavGrid {
  const signature = buildingSignature(buildings);
  if (!cachedGrid || signature !== cachedSignature) {
    cachedGrid = buildCampusNavGrid(buildings);
    cachedSignature = signature;
  }
  return cachedGrid;
}

export function invalidateCampusNavGrid(): void {
  cachedGrid = null;
  cachedSignature = "";
}