import { DEFAULT_OFFICE_THEME_PACK_ID } from "../data/officeThemePacks";
import { DEFAULT_OFFICE_VISUAL } from "../types/visualDesign";
import type { FurnitureInstance, OfficeVisualConfig } from "../types/visualDesign";
import {
  diffFurnitureScene,
  furnitureDiffIsEmpty,
  officeShellFingerprint,
} from "../utils/furnitureSceneDiff";
import { placeFurniture } from "../utils/buildModeActions";
import {
  FLOOR_PLAN_COARSE_GRID,
  FLOOR_PLAN_FINE_GRID,
  STUDIO_SNAP_GRID,
  floorPlanLayout,
  itemToPlanCoords,
  planCoordsToItemPosition,
} from "../utils/furnitureEditor";
import { normalizeOfficeVisual } from "../utils/officeVisualNormalize";
import {
  createPlacementCandidate,
  moveInstance,
  placeFromPlanPoint,
  planPointFromWorld,
  rotateInstance,
  validatePlacement,
  worldFromPlanPoint,
} from "../utils/placementEngine";

export interface ParityResult {
  name: string;
  passed: boolean;
  detail?: string;
}

function assert(name: string, condition: boolean, detail?: string): ParityResult {
  return { name, passed: condition, detail };
}

function sparseOffice(office: OfficeVisualConfig): OfficeVisualConfig {
  return { ...office, furniture: [] };
}

function officeZoneCenter(layout: ReturnType<typeof floorPlanLayout>) {
  const zone = layout.zones.find((entry) => entry.id === "office");
  if (!zone) {
    return null;
  }
  return {
    zone,
    planX: zone.x + zone.width / 2 + 1.5,
    planY: zone.y + zone.depth / 2 + 0.5,
  };
}

function positionsMatch(
  a: [number, number, number],
  b: [number, number, number],
): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function runPlacementParityTests(): ParityResult[] {
  const results: ParityResult[] = [];
  const office = normalizeOfficeVisual(DEFAULT_OFFICE_VISUAL, "hq");
  const layout = floorPlanLayout(office);
  const empty = sparseOffice(office);
  const center = officeZoneCenter(layout);

  results.push(
    assert("C1 snap grid 0.5m", STUDIO_SNAP_GRID === 0.5),
    assert("C1 floor plan fine grid 0.25m", FLOOR_PLAN_FINE_GRID === 0.25),
    assert("C1 floor plan coarse grid 1m", FLOOR_PLAN_COARSE_GRID === 1),
    assert(
      "C1 default theme startup_warm",
      (office.theme_pack ?? DEFAULT_OFFICE_THEME_PACK_ID) === "startup_warm",
    ),
  );

  const projectionFailures: string[] = [];
  for (const item of office.furniture) {
    const plan = itemToPlanCoords(item, layout);
    if (!plan) {
      projectionFailures.push(`${item.id}:no-plan`);
      continue;
    }
    const zone = layout.zones.find((entry) => entry.id === item.zone);
    if (!zone) {
      projectionFailures.push(`${item.id}:no-zone`);
      continue;
    }
    const expectedX = zone.x + zone.width / 2 + item.position[0];
    const expectedY = zone.y + zone.depth / 2 + item.position[2];
    if (plan.x !== expectedX || plan.y !== expectedY) {
      projectionFailures.push(`${item.id}:plan-mismatch`);
    }
  }
  results.push(
    assert(
      "C1 3D world position projects to 2D plan coords",
      projectionFailures.length === 0,
      projectionFailures.length > 0
        ? projectionFailures.slice(0, 3).join(";")
        : `count=${office.furniture.length}`,
    ),
  );

  const officeZone = layout.zones.find((entry) => entry.id === "office");
  if (officeZone) {
    const centerPlanX = officeZone.x + officeZone.width / 2;
    const centerPlanY = officeZone.y + officeZone.depth / 2;
    const enginePlace = placeFromPlanPoint(
      "floor_lamp",
      "hq",
      empty,
      layout,
      centerPlanX,
      centerPlanY,
    );
    if (enginePlace.ok && enginePlace.item) {
      const roundTrip = planPointFromWorld(enginePlace.item, layout);
      const roundWorld =
        roundTrip !== null
          ? planCoordsToItemPosition(officeZone, roundTrip.x, roundTrip.y)
          : null;
      results.push(
        assert(
          "C1 engine placement plan/world round-trip",
          Boolean(
            roundWorld &&
              roundWorld[0] === enginePlace.item.position[0] &&
              roundWorld[2] === enginePlace.item.position[2],
          ),
        ),
      );
    }
  }

  const planCoverage = office.furniture.every((item) => Boolean(planPointFromWorld(item, layout)));
  results.push(assert("C1 every furniture item maps to plan coords", planCoverage));

  if (center) {
    const { zone, planX, planY } = center;
    const worldFrom2D = worldFromPlanPoint(zone, planX, planY);
    const planPlace = placeFromPlanPoint("floor_lamp", "hq", empty, layout, planX, planY);
    const candidate = createPlacementCandidate("floor_lamp", "hq", "office", worldFrom2D);
    const worldPlace =
      candidate === null ? { ok: false as const } : validatePlacement(candidate, empty, []);

    const parityOk = Boolean(
      planPlace.ok &&
        worldPlace.ok &&
        planPlace.item &&
        worldPlace.item &&
        positionsMatch(planPlace.item.position, worldPlace.item.position) &&
        planPlace.item.rotation_y === worldPlace.item.rotation_y &&
        planPlace.item.zone === worldPlace.item.zone,
    );

    results.push(
      assert(
        "C1 2D placeFromPlanPoint matches 3D validatePlacement",
        parityOk,
        parityOk
          ? undefined
          : `2d=${planPlace.ok} 3d=${worldPlace.ok}`,
      ),
    );

    if (planPlace.ok && planPlace.item) {
      const dragWorld = planCoordsToItemPosition(zone, planX + 0.5, planY);
      const moved = moveInstance(planPlace.item, empty, dragWorld);
      const dragValidate = validatePlacement({ ...planPlace.item, position: dragWorld }, empty, []);
      results.push(
        assert(
          "C1 2D drag moveInstance matches 3D validatePlacement",
          Boolean(
            moved.ok &&
              dragValidate.ok &&
              moved.item &&
              dragValidate.item &&
              positionsMatch(moved.item.position, dragValidate.item.position),
          ),
        ),
      );

      const rotated = rotateInstance(planPlace.item, empty);
      results.push(
        assert(
          "C1 rotation preserves world x/z",
          Boolean(
            rotated.ok &&
              rotated.item &&
              rotated.item.position[0] === planPlace.item.position[0] &&
              rotated.item.position[2] === planPlace.item.position[2],
          ),
        ),
      );
    }
  }

  const legacyPlaced = placeFurniture(empty, "hq", "floor_lamp", "office", [1.5, 0, 0.5]);
  const engineCandidate = createPlacementCandidate("floor_lamp", "hq", "office", [1.5, 0, 0.5]);
  const enginePlaced =
    engineCandidate === null
      ? null
      : validatePlacement(engineCandidate, empty, []);

  results.push(assert("C1 placeFurniture returns array", Array.isArray(legacyPlaced)));
  results.push(
    assert(
      "C1 placeFurniture adds item",
      (legacyPlaced?.length ?? 0) === 1,
      `count=${legacyPlaced?.length ?? 0}`,
    ),
  );

  const engineLegacyParity =
    legacyPlaced &&
    legacyPlaced.length === 1 &&
    enginePlaced?.ok &&
    enginePlaced.item &&
    legacyPlaced[0].position[0] === enginePlaced.item.position[0] &&
    legacyPlaced[0].position[2] === enginePlaced.item.position[2];
  results.push(assert("C1 buildModeActions matches placementEngine", Boolean(engineLegacyParity)));

  if (legacyPlaced && legacyPlaced.length > 0) {
    const overlapDesk = legacyPlaced[0];
    const blocked = placeFurniture(
      { ...empty, furniture: legacyPlaced },
      "hq",
      "floor_lamp",
      "office",
      overlapDesk.position,
    );
    results.push(assert("C1 placeFurniture blocks overlap", blocked === null));
  }

  results.push(
    assert(
      "C1 furniture count unchanged via plan projection",
      office.furniture.length ===
        office.furniture.filter((item) => planPointFromWorld(item, layout)).length,
      `count=${office.furniture.length}`,
    ),
  );

  const lamp: FurnitureInstance = {
    id: "lamp-a",
    catalog_id: "floor_lamp",
    zone: "office",
    position: [0, 0, 0],
    rotation_y: 0,
  };
  const addDiff = diffFurnitureScene([], [lamp]);
  results.push(assert("C2 diff detects added furniture", addDiff.added.length === 1));
  const moveDiff = diffFurnitureScene([lamp], [{ ...lamp, position: [1, 0, 0] }]);
  results.push(assert("C2 diff detects transform update", moveDiff.transformUpdated.length === 1));
  const recreateDiff = diffFurnitureScene([lamp], [{ ...lamp, catalog_id: "plant_ficus" }]);
  results.push(assert("C2 diff detects catalog recreate", recreateDiff.recreated.length === 1));
  const removeDiff = diffFurnitureScene([lamp], []);
  results.push(
    assert(
      "C2 diff detects removed furniture",
      removeDiff.removedIds.length === 1 && furnitureDiffIsEmpty(addDiff) === false,
    ),
  );
  const shellA = officeShellFingerprint(office);
  const shellB = officeShellFingerprint({ ...office, furniture: [] });
  results.push(assert("C2 shell fingerprint ignores furniture", shellA === shellB));

  return results;
}