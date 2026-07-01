import { HK_LAYOUT_TEMPLATE_ID, HK_OFFICE_ROOM, hkRoomsForBuilding } from "../data/hkOfficeLayouts";
import { normalizeOfficeVisual } from "../utils/officeVisualNormalize";
import { countDesksInFurniture } from "../utils/hkOfficeFurnitureGenerator";
import { officeArchitecture } from "../utils/officeArchitecture";
import { DEFAULT_OFFICE_VISUAL } from "../types/visualDesign";
import type { AcceptanceResult } from "./acceptanceTests";

const BUILDINGS = ["hq", "engineering", "hr", "plaza", "park"] as const;

function assert(name: string, condition: boolean, detail?: string): AcceptanceResult {
  return { name, passed: condition, detail };
}

export function runHkOfficeAcceptanceTests(): AcceptanceResult[] {
  const results: AcceptanceResult[] = [];

  for (const buildingId of BUILDINGS) {
    const office = normalizeOfficeVisual(DEFAULT_OFFICE_VISUAL, buildingId);
    const desks = countDesksInFurniture(office.furniture);
    const arch = officeArchitecture(office);
    const managerMarkers = office.furniture.filter((item) => item.catalog_id === "desk_executive").length;
    const pantryMarkers = office.furniture.filter((item) => item.id.includes("pantry") || item.id.includes("water-cooler")).length;
    const meetingMarkers = office.furniture.filter((item) => item.id.startsWith("meet-") || item.id.startsWith("whiteboard-meet")).length;

    results.push(
      assert(
        `HK ${buildingId} layout template`,
        office.layout_template === HK_LAYOUT_TEMPLATE_ID,
      ),
      assert(
        `HK ${buildingId} room width`,
        office.room.width >= 18,
        `width=${office.room.width}`,
      ),
      assert(
        `HK ${buildingId} desk count`,
        desks >= 48,
        `desks=${desks}`,
      ),
      assert(
        `HK ${buildingId} partition walls`,
        arch.freeform_enabled && arch.walls.length >= 4,
        `walls=${arch.walls.length}`,
      ),
      assert(
        `HK ${buildingId} manager rooms`,
        managerMarkers >= 2,
        `executive_desks=${managerMarkers}`,
      ),
      assert(
        `HK ${buildingId} pantry`,
        pantryMarkers >= 1,
      ),
      assert(
        `HK ${buildingId} meeting space`,
        meetingMarkers >= 1,
        `markers=${meetingMarkers}`,
      ),
    );
  }

  const rooms = hkRoomsForBuilding("hq");
  results.push(
    assert(
      "HK base office plate",
      rooms.room.width === HK_OFFICE_ROOM.width && rooms.room.depth === HK_OFFICE_ROOM.depth,
    ),
  );

  const hkFailed = results.filter((result) => !result.passed).length;
  results.push(
    assert(
      "HK 50-person office gate",
      hkFailed === 0,
      hkFailed > 0 ? `${hkFailed} check(s) failing` : "all green",
    ),
  );

  return results;
}