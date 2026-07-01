import type { FurnitureCatalogEntry } from "../types/visualDesign";

const BLENDER_ASSET_ROOT = "/assets/furniture/blender";

/** Prefer Blender-authored GLB when catalog entry declares an override. */
export function resolveFurnitureGltfPath(entry: Pick<FurnitureCatalogEntry, "id" | "gltfPath" | "blenderGltfPath">): string {
  if (entry.blenderGltfPath) {
    return entry.blenderGltfPath;
  }
  return entry.gltfPath;
}

export function blenderDropPath(catalogId: string, ext: "glb" | "gltf" = "glb"): string {
  return `${BLENDER_ASSET_ROOT}/${catalogId}.${ext}`;
}