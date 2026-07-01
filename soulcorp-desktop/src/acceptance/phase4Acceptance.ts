import { DEFAULT_OFFICE_VISUAL } from "../types/visualDesign";
import {
  architectureFootprintArea,
  createWallSegment,
  normalizeOfficeArchitecture,
  officeArchitecture,
  snapWallPoint,
  wallSegmentLength,
  WALL_SEGMENT_MIN_LENGTH,
  wallsOnFloor,
} from "../utils/officeArchitecture";
import { floorPlanLayout } from "../utils/furnitureEditor";
import { normalizeOfficeVisual } from "../utils/officeVisualNormalize";
import type { AcceptanceResult } from "./acceptanceTests";

function assert(name: string, condition: boolean, detail?: string): AcceptanceResult {
  return { name, passed: condition, detail };
}

export function runPhase4AcceptanceTests(): AcceptanceResult[] {
  const results: AcceptanceResult[] = [];
  const office = normalizeOfficeVisual(DEFAULT_OFFICE_VISUAL, "hq");
  const layout = floorPlanLayout(office);

  const defaults = normalizeOfficeArchitecture(undefined);
  results.push(assert("P4 architecture default off", !defaults.freeform_enabled && defaults.floor_count === 1));
  results.push(assert("P4 architecture floor cap 3", defaults.floor_count <= 3));

  const segment = createWallSegment(0, [1, 1], [4, 1]);
  results.push(assert("P4 wall segment snaps grid", segment !== null && segment.start[0] === 1));
  results.push(
    assert(
      "P4 wall segment min length",
      segment !== null && wallSegmentLength(segment.start, segment.end) >= WALL_SEGMENT_MIN_LENGTH,
    ),
  );

  const enabledOffice = normalizeOfficeVisual(
    {
      ...DEFAULT_OFFICE_VISUAL,
      architecture: {
        freeform_enabled: true,
        floor_count: 2,
        walls: [
          segment!,
          { ...segment!, id: "wall-2f", floor: 1, start: [2, 2], end: [5, 2] },
        ],
      },
    },
    "hq",
  );
  const arch = officeArchitecture(enabledOffice);
  results.push(assert("P4 multi-floor walls", wallsOnFloor(arch, 1).length === 1));
  results.push(
    assert(
      "P4 stacked footprint area",
      architectureFootprintArea(enabledOffice) > layout.maxWidth * layout.totalDepth,
    ),
  );
  results.push(
    assert(
      "P4 snap wall point 0.5 grid",
      snapWallPoint(1.13, 2.27).join(",") === "1,2.5",
    ),
  );

  const phase4Checks = results.length;
  const phase4Failed = results.filter((result) => !result.passed).length;
  results.push(
    assert(
      "Phase 4 complete gate",
      phase4Failed === 0,
      phase4Failed > 0 ? `${phase4Failed}/${phase4Checks} failing` : "all green",
    ),
  );

  return results;
}