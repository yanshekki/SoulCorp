import {
  AUTHORED_FURNITURE_ASSET_IDS,
  CORE_FURNITURE_ASSET_IDS,
  isAuthoredFurnitureAsset,
} from "../data/coreFurnitureAssets";
import { FURNITURE_CATALOG } from "../data/furnitureCatalog";
import { DEFAULT_OFFICE_VISUAL } from "../types/visualDesign";
import { normalizeOfficeVisual } from "../utils/officeVisualNormalize";
import type { AcceptanceResult } from "./acceptanceTests";

function assert(name: string, condition: boolean, detail?: string): AcceptanceResult {
  return { name, passed: condition, detail };
}

export function runPhase5ArtAcceptanceTests(): AcceptanceResult[] {
  const results: AcceptanceResult[] = [];

  results.push(
    assert(
      "P5 catalog has 25 authored entries",
      FURNITURE_CATALOG.length >= 25,
      `count=${FURNITURE_CATALOG.length}`,
    ),
  );
  results.push(
    assert(
      "P5 authored asset registry",
      AUTHORED_FURNITURE_ASSET_IDS.length >= 25 &&
        AUTHORED_FURNITURE_ASSET_IDS.length === FURNITURE_CATALOG.length,
      `authored=${AUTHORED_FURNITURE_ASSET_IDS.length}`,
    ),
  );
  results.push(
    assert(
      "P5 core assets remain authored",
      CORE_FURNITURE_ASSET_IDS.every((id) => isAuthoredFurnitureAsset(id)),
    ),
  );

  const decorIds = ["wall_poster", "wall_canvas", "rug_runner", "rug_round"] as const;
  const decorEntries = decorIds.map((id) => FURNITURE_CATALOG.find((entry) => entry.id === id));
  results.push(
    assert(
      "P5 wall and carpet decor catalog",
      decorEntries.every(Boolean) &&
        decorEntries[0]?.defaultProps?.wallMount === true &&
        decorEntries[2]?.defaultProps?.floorDecal === true,
    ),
  );

  results.push(
    assert(
      "P5 catalog GLTF paths authored",
      FURNITURE_CATALOG.every(
        (entry) =>
          entry.gltfPath.startsWith("/assets/furniture/") && entry.gltfPath.endsWith(".gltf"),
      ),
    ),
  );

  const office = normalizeOfficeVisual(DEFAULT_OFFICE_VISUAL, "hq");
  results.push(
    assert(
      "P5 default office seeds art decor",
      office.furniture.some((item) => item.catalog_id === "wall_poster") &&
        office.furniture.some((item) => item.catalog_id === "rug_runner"),
    ),
  );

  const phase5Checks = results.length;
  const phase5Failed = results.filter((result) => !result.passed).length;
  results.push(
    assert(
      "Art deepening complete gate",
      phase5Failed === 0,
      phase5Failed > 0 ? `${phase5Failed}/${phase5Checks} failing` : "all green",
    ),
  );

  return results;
}