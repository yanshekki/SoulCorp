import { DEFAULT_OFFICE_VISUAL } from "../types/visualDesign";
import {
  createInteriorOrbitForMode,
  createRenderInteriorOrbit,
  officeZoneFocusPan,
  STUDIO_PERSPECTIVE_FOV,
} from "../utils/interiorCamera";
import { STUDIO_BLOOM_STRENGTH } from "../utils/studioPostPipeline";
import { interiorScreenshotFilename } from "../utils/interiorScreenshot";
import { normalizeOfficeVisual } from "../utils/officeVisualNormalize";
import type { AcceptanceResult } from "./acceptanceTests";

function assert(name: string, condition: boolean, detail?: string): AcceptanceResult {
  return { name, passed: condition, detail };
}

export function runPhase3AcceptanceTests(): AcceptanceResult[] {
  const results: AcceptanceResult[] = [];
  const office = normalizeOfficeVisual(DEFAULT_OFFICE_VISUAL, "hq");
  const renderOrbit = createRenderInteriorOrbit(office);
  const focus = officeZoneFocusPan(office);

  results.push(assert("P3 render FOV 42°", STUDIO_PERSPECTIVE_FOV === 42));
  results.push(
    assert(
      "P3 render orbit focuses office zone",
      renderOrbit.panZ === focus.panZ && renderOrbit.frustum > 0,
      `panZ=${renderOrbit.panZ}`,
    ),
  );
  results.push(
    assert(
      "P3 render orbit studio framing",
      renderOrbit.zoom >= 0.85 && renderOrbit.elevation >= 0.4,
      `zoom=${renderOrbit.zoom}`,
    ),
  );
  results.push(
    assert(
      "P3 orbit factory render branch",
      createInteriorOrbitForMode(office, "render").panZ === renderOrbit.panZ,
    ),
  );
  results.push(
    assert(
      "P3 screenshot filename png",
      interiorScreenshotFilename("HQ", 1_700_000_000_000) === "soulcorp-office-hq-1700000000000.png",
    ),
  );
  results.push(
    assert(
      "P3 studioClarity bloom cap for SSAO render",
      STUDIO_BLOOM_STRENGTH <= 0.12,
      `strength=${STUDIO_BLOOM_STRENGTH}`,
    ),
  );

  const phase3Checks = results.length;
  const phase3Failed = results.filter((result) => !result.passed).length;
  results.push(
    assert(
      "Phase 3 complete gate",
      phase3Failed === 0,
      phase3Failed > 0 ? `${phase3Failed}/${phase3Checks} failing` : "all green",
    ),
  );

  return results;
}