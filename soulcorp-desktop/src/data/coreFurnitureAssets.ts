/** Phase B2 — 8 core props with authored PBR textures (see scripts/generate-furniture-gltf.mjs). */
export const CORE_FURNITURE_ASSET_IDS = [
  "desk_open",
  "chair_office",
  "sofa",
  "plant_ficus",
  "monitor",
  "reception_desk",
  "whiteboard",
  "floor_lamp",
] as const;

/** Art deepening — full catalog + wall/carpet decor (procedural authored GLTF). */
export const AUTHORED_FURNITURE_ASSET_IDS = [
  ...CORE_FURNITURE_ASSET_IDS,
  "desk_cubicle",
  "desk_executive",
  "desk_creative",
  "desk_lounge",
  "chair_executive",
  "sofa_corner",
  "plant_potted",
  "laptop",
  "server_rack",
  "bookshelf",
  "coffee_table",
  "filing_cabinet",
  "water_cooler",
  "wall_poster",
  "wall_canvas",
  "rug_runner",
  "rug_round",
] as const;

export type CoreFurnitureAssetId = (typeof CORE_FURNITURE_ASSET_IDS)[number];
export type AuthoredFurnitureAssetId = (typeof AUTHORED_FURNITURE_ASSET_IDS)[number];

export function isCoreFurnitureAsset(catalogId: string): catalogId is CoreFurnitureAssetId {
  return (CORE_FURNITURE_ASSET_IDS as readonly string[]).includes(catalogId);
}

export function isAuthoredFurnitureAsset(catalogId: string): catalogId is AuthoredFurnitureAssetId {
  return (AUTHORED_FURNITURE_ASSET_IDS as readonly string[]).includes(catalogId);
}