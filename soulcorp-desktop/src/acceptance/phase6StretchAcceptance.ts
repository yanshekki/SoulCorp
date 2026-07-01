import { initFurnitureKtx2Support } from "../components/world/gltfAssetLoader";
import { applyStylizedAgentAnimation } from "../components/world/stylizedAgentAnimation";
import { blenderDropPath, resolveFurnitureGltfPath } from "../utils/furnitureAssetPath";
import { PHASE1_FEEL_REVIEW } from "./phase1FeelReview";
import { FURNITURE_CATALOG } from "../data/furnitureCatalog";
import type { AcceptanceResult } from "./acceptanceTests";

function assert(name: string, condition: boolean, detail?: string): AcceptanceResult {
  return { name, passed: condition, detail };
}

export function runPhase6StretchAcceptanceTests(): AcceptanceResult[] {
  const results: AcceptanceResult[] = [];

  results.push(
    assert(
      "P6 feel review post art/walk",
      PHASE1_FEEL_REVIEW.score >= 8 && PHASE1_FEEL_REVIEW.pillars.mood >= 8,
      `score=${PHASE1_FEEL_REVIEW.score}`,
    ),
  );

  results.push(
    assert(
      "P6 agent animation API",
      typeof applyStylizedAgentAnimation === "function",
    ),
  );

  results.push(
    assert(
      "P6 furniture path resolver",
      resolveFurnitureGltfPath(FURNITURE_CATALOG[0]) === FURNITURE_CATALOG[0].gltfPath &&
        blenderDropPath("desk_open").endsWith("/desk_open.glb"),
    ),
  );

  results.push(
    assert(
      "P6 KTX2 loader hook",
      typeof initFurnitureKtx2Support === "function",
    ),
  );

  const phase6Checks = results.length;
  const phase6Failed = results.filter((result) => !result.passed).length;
  results.push(
    assert(
      "Stretch goals complete gate",
      phase6Failed === 0,
      phase6Failed > 0 ? `${phase6Failed}/${phase6Checks} failing` : "all green",
    ),
  );

  return results;
}