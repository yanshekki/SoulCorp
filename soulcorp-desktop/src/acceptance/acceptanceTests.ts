import { runPhase1AcceptanceTests } from "./phase1Acceptance";
import { runPhase2AcceptanceTests } from "./phase2Acceptance";
import { runPhase3AcceptanceTests } from "./phase3Acceptance";
import { runPlacementParityTests } from "./placementParity";
import {
  bindAgentToDesk,
  furnitureActionForCatalog,
  hasMoraleDecorNearby,
  sfxForFurnitureAction,
} from "../utils/furnitureInteractions";
import {
  floorPlanLayout,
  snapPosition,
  snapScalar,
} from "../utils/furnitureEditor";
import { CORE_FURNITURE_ASSET_IDS } from "../data/coreFurnitureAssets";
import { catalogEntryIcon, getCatalogEntry } from "../data/furnitureCatalog";
import { normalizeOfficeVisual } from "../utils/officeVisualNormalize";
import { withPreviewDecor } from "../utils/previewOfficeDecor";
import { studioClarityLightingPreset } from "../utils/interiorPostPolish";
import { STUDIO_PERSPECTIVE_FOV } from "../utils/interiorCamera";
import { floorKitLabel } from "../utils/roomKitTextures";
import { floorTextureRepeat } from "../utils/interiorScale";
import { formatFootprintDimensions } from "../utils/furniturePlanSilhouette";
import { furnitureThumbnailPath } from "../utils/furnitureThumbnail";
import { DEFAULT_OFFICE_VISUAL } from "../types/visualDesign";
import { GAME_DESIGN_CHECKLIST } from "./gameDesignChecklist";
import { getCampusNavGrid } from "../utils/campusNavGrid";
import { findPath } from "../utils/pathfinding";
import { buildOfficeNavGrids } from "../utils/officeNavGrid";

export interface AcceptanceResult {
  name: string;
  passed: boolean;
  detail?: string;
}

function assert(name: string, condition: boolean, detail?: string): AcceptanceResult {
  return { name, passed: condition, detail };
}

export function runAcceptanceTests(): AcceptanceResult[] {
  const results: AcceptanceResult[] = [];

  results.push(assert("snapScalar rounds to 0.5 grid", snapScalar(1.13) === 1.0));
  results.push(assert("snapPosition pairs x/z", snapPosition(1.2, 2.7).join(",") === "1,2.5"));

  const office = normalizeOfficeVisual(DEFAULT_OFFICE_VISUAL, "hq");
  const layout = floorPlanLayout(office);
  results.push(assert("floor plan has 3 zones", layout.zones.length === 3));
  results.push(
    assert(
      "legacy migration produces furniture",
      office.furniture.length > 0,
      `count=${office.furniture.length}`,
    ),
  );

  results.push(...runPlacementParityTests());
  results.push(...runPhase1AcceptanceTests());
  results.push(...runPhase2AcceptanceTests());
  results.push(...runPhase3AcceptanceTests());

  const automated = GAME_DESIGN_CHECKLIST.filter((item) => item.automated).length;
  results.push(
    assert(
      "checklist fully automated",
      automated === GAME_DESIGN_CHECKLIST.length,
      `${automated}/${GAME_DESIGN_CHECKLIST.length} automated`,
    ),
  );

  results.push(
    assert(
      "reception maps to HR action",
      furnitureActionForCatalog("reception_desk") === "reception_hr",
    ),
  );
  results.push(assert("whiteboard maps to meeting action", furnitureActionForCatalog("whiteboard") === "whiteboard_meeting"));
  results.push(assert("monitor maps to equipment action", furnitureActionForCatalog("monitor") === "equipment_info"));
  results.push(assert("plant maps to decor buff", furnitureActionForCatalog("plant_ficus") === "decor_buff"));
  results.push(assert("desk tap sfx exists", sfxForFurnitureAction("desk_assign") === "desk_tap"));

  const desk = office.furniture.find((item) => item.catalog_id.startsWith("desk_"));
  if (desk) {
    const bound = bindAgentToDesk(office, desk.id, "agent-test-1");
    const assigned = bound.find((item) => item.id === desk.id);
    results.push(assert("bindAgentToDesk sets linked_agent_id", assigned?.linked_agent_id === "agent-test-1"));
  }

  const withPlant = {
    ...office,
    furniture: [
      ...office.furniture,
      {
        id: "plant-test",
        catalog_id: "plant_ficus",
        zone: "office" as const,
        position: [0, 0, 0] as [number, number, number],
        rotation_y: 0,
      },
    ],
  };
  results.push(assert("morale decor within 2m", hasMoraleDecorNearby([0.5, 0, 0.5], withPlant)));

  const sparseOffice = { ...office, furniture: office.furniture.slice(0, 2) };
  const previewDecor = withPreviewDecor(sparseOffice, "hq");
  results.push(
    assert(
      "preview decor adds ephemeral plants/lamps",
      previewDecor.furniture.some((item) => item.id.startsWith("preview-plant-")) &&
        previewDecor.furniture.some((item) => item.id.startsWith("preview-light-")),
      `count=${previewDecor.furniture.length}`,
    ),
  );
  results.push(assert("preview decor does not mutate source", sparseOffice.furniture.length === 2));

  const floorLamp = getCatalogEntry("floor_lamp");
  results.push(assert("floor lamp catalog exists", floorLamp?.category === "lighting"));
  results.push(
    assert(
      "B2 core furniture catalog entries resolve",
      CORE_FURNITURE_ASSET_IDS.every((id) => Boolean(getCatalogEntry(id)?.gltfPath)),
      CORE_FURNITURE_ASSET_IDS.join(","),
    ),
  );
  results.push(
    assert(
      "A4 footprint dimension label format",
      formatFootprintDimensions([1.2, 0.75]) === "1.20 × 0.75 m",
    ),
  );
  results.push(
    assert(
      "B3 floor texture 1m repeat",
      floorTextureRepeat(3.6, 2.9).join(",") === "3.6,2.9",
    ),
  );
  results.push(
    assert(
      "B3 StartupWarm oak plank kit",
      floorKitLabel("startup_warm") === "oak plank",
    ),
  );
  results.push(
    assert(
      "B4 studioClarity ambient intensity",
      studioClarityLightingPreset().ambientIntensity === 0.78,
    ),
  );
  results.push(assert("B4 perspective FOV 42°", STUDIO_PERSPECTIVE_FOV === 42));
  results.push(
    assert(
      "catalog icons resolve",
      catalogEntryIcon({ category: "desk" }) === "🗄" && catalogEntryIcon({ category: "lighting" }) === "💡",
    ),
  );
  results.push(
    assert(
      "furniture thumbnail paths resolve",
      furnitureThumbnailPath("desk_open").endsWith("/desk_open.svg"),
    ),
  );

  const campusGrid = getCampusNavGrid();
  const campusPath = findPath(campusGrid, [-10, 0, -2], [8, 0, 5]);
  results.push(
    assert(
      "campus pathfinding routes around buildings",
      campusPath !== null && (campusPath?.length ?? 0) > 2,
      `steps=${campusPath?.length ?? 0}`,
    ),
  );

  const officeGrids = buildOfficeNavGrids(office);
  results.push(
    assert(
      "office nav grids cover 3 zones",
      officeGrids.lobby.width > 0 &&
        officeGrids.corridor.height > 0 &&
        officeGrids.office.width > 0,
    ),
  );

  return results;
}

export function summarizeResults(results: AcceptanceResult[]): {
  passed: number;
  failed: number;
  ok: boolean;
} {
  const failed = results.filter((result) => !result.passed).length;
  return {
    passed: results.length - failed,
    failed,
    ok: failed === 0,
  };
}