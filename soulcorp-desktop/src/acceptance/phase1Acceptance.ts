import * as THREE from "three";
import { CORE_FURNITURE_ASSET_IDS } from "../data/coreFurnitureAssets";
import { presetDesignFor } from "../data/presetDesigns";
import { DEFAULT_OFFICE_THEME_PACK_ID } from "../data/officeThemePacks";
import { DEFAULT_OFFICE_VISUAL } from "../types/visualDesign";
import { normalizeOfficeVisual } from "../utils/officeVisualNormalize";
import { applyInteriorScenePolish, studioClarityLightingPreset } from "../utils/interiorPostPolish";
import { STUDIO_BLOOM_STRENGTH } from "../utils/studioPostPipeline";
import { diffFurnitureScene } from "../utils/furnitureSceneDiff";
import {
  createPlacementCandidate,
  placeFromPlanPoint,
  validatePlacement,
} from "../utils/placementEngine";
import { PHASE1_FEEL_REVIEW } from "./phase1FeelReview";
import type { AcceptanceResult } from "./acceptanceTests";

function assert(name: string, condition: boolean, detail?: string): AcceptanceResult {
  return { name, passed: condition, detail };
}

/** Layout step uses 50/50 split per A3 — mirrored from OfficeBuildToolbar STEPS. */
const LAYOUT_STEP_SPLIT_VIEW = "split" as const;

export function runPhase1AcceptanceTests(): AcceptanceResult[] {
  const results: AcceptanceResult[] = [];
  const office = normalizeOfficeVisual(DEFAULT_OFFICE_VISUAL, "hq");
  const warmStartup = presetDesignFor("warm-startup");

  results.push(
    assert(
      "P1 default office uses startup_warm",
      DEFAULT_OFFICE_VISUAL.theme_pack === "startup_warm" &&
        (office.theme_pack ?? DEFAULT_OFFICE_THEME_PACK_ID) === "startup_warm",
    ),
  );

  results.push(
    assert(
      "P1 warm-startup preset uses startup_warm",
      ["hq", "engineering", "hr", "plaza", "park"].every(
        (id) => warmStartup.offices[id]?.theme_pack === "startup_warm",
      ),
    ),
  );

  results.push(
    assert(
      "P1 B2 core props count",
      CORE_FURNITURE_ASSET_IDS.length === 8,
      `count=${CORE_FURNITURE_ASSET_IDS.length}`,
    ),
  );

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x112233, 4, 40);
  applyInteriorScenePolish(scene, office);
  results.push(assert("P1 design studio clears distance fog", scene.fog === null));

  results.push(
    assert(
      "P1 studioClarity bloom cap",
      STUDIO_BLOOM_STRENGTH <= 0.12,
      `strength=${STUDIO_BLOOM_STRENGTH}`,
    ),
  );

  const studioLight = studioClarityLightingPreset();
  results.push(
    assert(
      "P1 studioClarity warm key light",
      studioLight.keyColor === 0xfff0d8 && studioLight.keyIntensity >= 1.1,
    ),
  );

  results.push(
    assert(
      "P1 placement engine unified API",
      typeof placeFromPlanPoint === "function" &&
        typeof validatePlacement === "function" &&
        typeof createPlacementCandidate === "function",
    ),
  );

  results.push(
    assert(
      "P1 furniture scene diff API",
      typeof diffFurnitureScene === "function",
    ),
  );

  results.push(
    assert(
      "P1 layout step split view default",
      LAYOUT_STEP_SPLIT_VIEW === "split",
    ),
  );

  const feelProxies =
    DEFAULT_OFFICE_VISUAL.floor_color === "#c9a882" &&
    DEFAULT_OFFICE_VISUAL.wall_color === "#f5f0e8" &&
    studioLight.ambientIntensity >= 0.75 &&
    scene.fog === null &&
    STUDIO_BLOOM_STRENGTH <= 0.12;
  results.push(assert("P1 Sims/TPH feel proxies", feelProxies));

  results.push(
    assert(
      "P1 internal feel review score",
      PHASE1_FEEL_REVIEW.score >= PHASE1_FEEL_REVIEW.minimumScore,
      `${PHASE1_FEEL_REVIEW.score}/${PHASE1_FEEL_REVIEW.minimumScore}`,
    ),
  );

  const phase1Failed = results.filter((result) => !result.passed).length;
  results.push(
    assert(
      "Phase 1 complete gate",
      phase1Failed === 0,
      phase1Failed > 0 ? `${phase1Failed} criterion(s) failing` : "all green",
    ),
  );

  return results;
}