import { DEFAULT_OFFICE_VISUAL } from "../types/visualDesign";
import {
  createWalkInteriorOrbit,
  officeZoneFocusPan,
  STUDIO_PERSPECTIVE_FOV,
  WALK_PERSPECTIVE_FOV,
} from "../utils/interiorCamera";
import { playCozyLightingPreset, studioClarityLightingPreset } from "../utils/interiorPostPolish";
import { WALL_PEEL_MIN_OPACITY } from "../utils/interiorWallFade";
import {
  applyWalkKeyboardMove,
  clampWalkPan,
  emptyWalkKeys,
  interiorWalkBounds,
  interiorZoneCenterPan,
  walkZoneAtPan,
  WALK_KEYBOARD_SPEED,
} from "../utils/interiorWalkControls";
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

  const bounds = interiorWalkBounds(office);
  const keys = { ...emptyWalkKeys(), forward: true };
  const movedOrbit = { ...walkOrbit };
  applyWalkKeyboardMove(movedOrbit, keys, 0.2);
  clampWalkPan(movedOrbit, office);
  results.push(
    assert(
      "P2 WASD walk keyboard moves pan",
      movedOrbit.panZ < walkOrbit.panZ && movedOrbit.panZ >= bounds.minZ,
    ),
  );
  results.push(assert("P2 walk keyboard speed", WALK_KEYBOARD_SPEED >= 2));
  results.push(
    assert(
      "P2 walk zone at pan detects office",
      walkZoneAtPan(office, focus.panX, focus.panZ) === "office",
    ),
  );
  results.push(
    assert(
      "P2 zone jump pan for lobby",
      interiorZoneCenterPan(office, "lobby").panZ > focus.panZ,
    ),
  );

  const cozy = playCozyLightingPreset("warm");
  const studio = studioClarityLightingPreset();
  results.push(
    assert(
      "P2 playCozy matches studioClarity key",
      cozy.keyIntensity === studio.keyIntensity && cozy.zoneLightIntensity === studio.zoneLightIntensity,
    ),
  );

  const phase2Checks = results.length;
  const phase2Failed = results.filter((result) => !result.passed).length;
  results.push(
    assert(
      "Phase 2 complete gate",
      phase2Failed === 0,
      phase2Failed > 0 ? `${phase2Failed}/${phase2Checks} failing` : "all green",
    ),
  );

  return results;
}