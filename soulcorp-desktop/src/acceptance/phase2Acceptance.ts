import { DEFAULT_OFFICE_VISUAL } from "../types/visualDesign";
import {
  createWalkInteriorOrbit,
  officeZoneFocusPan,
  STUDIO_PERSPECTIVE_FOV,
  WALK_PERSPECTIVE_FOV,
} from "../utils/interiorCamera";
import { WALL_PEEL_MIN_OPACITY } from "../utils/interiorWallFade";
import { normalizeOfficeVisual } from "../utils/officeVisualNormalize";
import type { AcceptanceResult } from "./acceptanceTests";

function assert(name: string, condition: boolean, detail?: string): AcceptanceResult {
  return { name, passed: condition, detail };
}

export function runPhase2AcceptanceTests(): AcceptanceResult[] {
  const results: AcceptanceResult[] = [];
  const office = normalizeOfficeVisual(DEFAULT_OFFICE_VISUAL, "hq");
  const walkOrbit = createWalkInteriorOrbit(office);
  const focus = officeZoneFocusPan(office);

  results.push(assert("P2 walk FOV 42°", WALK_PERSPECTIVE_FOV === 42));
  results.push(assert("P2 walk FOV matches studio", WALK_PERSPECTIVE_FOV === STUDIO_PERSPECTIVE_FOV));
  results.push(assert("P2 wall peel min opacity 0.22", WALL_PEEL_MIN_OPACITY === 0.22));
  results.push(
    assert(
      "P2 walk orbit focuses office zone",
      walkOrbit.panZ === focus.panZ && walkOrbit.frustum > 0,
      `panZ=${walkOrbit.panZ}`,
    ),
  );
  results.push(
    assert(
      "P2 walk orbit closer than iso game zoom",
      walkOrbit.zoom >= 0.9,
      `zoom=${walkOrbit.zoom}`,
    ),
  );

  const phase2Failed = results.filter((result) => !result.passed).length;
  results.push(
    assert(
      "Phase 2 walk mode gate",
      phase2Failed === 0,
      phase2Failed > 0 ? `${phase2Failed} check(s) failing` : "walk camera + peel ready",
    ),
  );

  return results;
}