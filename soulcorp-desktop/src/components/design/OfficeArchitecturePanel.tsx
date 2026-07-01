import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import {
  DEFAULT_OFFICE_VISUAL,
  OFFICE_ARCHITECTURE_FLOOR_MAX,
  OFFICE_ARCHITECTURE_FLOOR_MIN,
} from "../../types/visualDesign";
import { officeArchitecture, wallsOnFloor } from "../../utils/officeArchitecture";
import { normalizeOfficeVisual } from "../../utils/officeVisualNormalize";

export function OfficeArchitecturePanel() {
  const buildings = useGameStore((state) => state.buildings);
  const selectedBuildingId = useDesignStudioStore((state) => state.selectedBuildingId);
  const draft = useDesignStudioStore((state) => state.draft);
  const planTool = useDesignStudioStore((state) => state.planTool);
  const activeArchitectureFloor = useDesignStudioStore((state) => state.activeArchitectureFloor);
  const setPlanTool = useDesignStudioStore((state) => state.setPlanTool);
  const setActiveArchitectureFloor = useDesignStudioStore((state) => state.setActiveArchitectureFloor);
  const patchOfficeDraft = useDesignStudioStore((state) => state.patchOfficeDraft);

  const buildingId = selectedBuildingId ?? buildings[0]?.id ?? "hq";
  const config = normalizeOfficeVisual(draft.offices[buildingId] ?? DEFAULT_OFFICE_VISUAL, buildingId);
  const architecture = officeArchitecture(config);
  const wallsThisFloor = wallsOnFloor(architecture, activeArchitectureFloor);

  const patchArchitecture = (patch: Partial<typeof architecture>) => {
    patchOfficeDraft(buildingId, {
      architecture: { ...architecture, ...patch },
    });
  };

  return (
    <section className="design-architecture-panel">
      <header>
        <h3>自由架構</h3>
        <p className="muted">可選 RoomSketcher 級畫牆 · 最多 {OFFICE_ARCHITECTURE_FLOOR_MAX} 層</p>
      </header>

      <label className="design-architecture-toggle">
        <input
          type="checkbox"
          checked={architecture.freeform_enabled}
          onChange={(event) => {
            const enabled = event.target.checked;
            patchArchitecture({ freeform_enabled: enabled });
            if (!enabled) {
              setPlanTool("furniture");
            }
          }}
        />
        <span>啟用自由畫牆</span>
      </label>

      {architecture.freeform_enabled ? (
        <>
          <div className="design-architecture-floors">
            <span className="design-architecture-label">樓層</span>
            <input
              type="range"
              min={OFFICE_ARCHITECTURE_FLOOR_MIN}
              max={OFFICE_ARCHITECTURE_FLOOR_MAX}
              step={1}
              value={architecture.floor_count}
              onChange={(event) => {
                const floorCount = Number(event.target.value);
                const trimmedWalls = architecture.walls.filter((wall) => wall.floor < floorCount);
                patchArchitecture({ floor_count: floorCount, walls: trimmedWalls });
                if (activeArchitectureFloor >= floorCount) {
                  setActiveArchitectureFloor(floorCount - 1);
                }
              }}
              aria-label="樓層數量"
            />
            <strong>{architecture.floor_count} 層</strong>
          </div>

          <div className="design-architecture-floor-tabs" role="group" aria-label="編輯樓層">
            {Array.from({ length: architecture.floor_count }, (_, floor) => (
              <button
                key={floor}
                type="button"
                className={activeArchitectureFloor === floor ? "active" : ""}
                onClick={() => setActiveArchitectureFloor(floor)}
              >
                {floor + 1}F
              </button>
            ))}
          </div>

          <div className="design-architecture-tools" role="group" aria-label="平面圖工具">
            <button
              type="button"
              className={planTool === "furniture" ? "active" : ""}
              onClick={() => setPlanTool("furniture")}
            >
              傢俬
            </button>
            <button
              type="button"
              className={planTool === "wall" ? "active" : ""}
              onClick={() => setPlanTool("wall")}
            >
              畫牆
            </button>
          </div>

          <p className="muted design-architecture-hint">
            {planTool === "wall"
              ? `喺平面圖連續撳兩點畫牆（${activeArchitectureFloor + 1}F · 已畫 ${wallsThisFloor.length} 段）`
              : "切換「畫牆」後喺平面圖加牆身分段"}
          </p>
        </>
      ) : (
        <p className="muted">預設仍用大堂／走廊／辦公區模組；開啟後可疊加自訂牆身。</p>
      )}
    </section>
  );
}