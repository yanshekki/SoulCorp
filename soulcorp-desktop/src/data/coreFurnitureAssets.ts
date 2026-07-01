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

export type CoreFurnitureAssetId = (typeof CORE_FURNITURE_ASSET_IDS)[number];

export function isCoreFurnitureAsset(catalogId: string): catalogId is CoreFurnitureAssetId {
  return (CORE_FURNITURE_ASSET_IDS as readonly string[]).includes(catalogId);
}