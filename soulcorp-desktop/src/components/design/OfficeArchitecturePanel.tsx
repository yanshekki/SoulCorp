import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import {
  DEFAULT_OFFICE_VISUAL,
  OFFICE_ARCHITECTURE_FLOOR_MAX,
  OFFICE_ARCHITECTURE_FLOOR_MIN,
} from "../../types/visualDesign";
import { officeArchitecture, wallsOnFloor } from "../../utils/officeArchitecture";
import { normalizeOfficeVisual } from "../../utils/officeVisualNormalize";
import { useI18n } from "../../i18n/I18nProvider";

export function OfficeArchitecturePanel() {
  const { t } = useI18n();
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
        <h3>{t("design.freeformArch")}</h3>
        <p className="muted">{t("design.freeformArchDesc", { max: OFFICE_ARCHITECTURE_FLOOR_MAX })}</p>
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
        <span>{t("design.enableFreeform")}</span>
      </label>

      {architecture.freeform_enabled ? (
        <>
          <div className="design-architecture-floors">
            <span className="design-architecture-label">{t("design.floors")}</span>
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
              aria-label={t("design.floorCount")}
            />
            <strong>{t("design.floorsN", { n: architecture.floor_count })}</strong>
          </div>

          <div className="design-architecture-floor-tabs" role="group" aria-label={t("design.editFloor")}>
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

          <div className="design-architecture-tools" role="group" aria-label={t("design.floorPlanTools")}>
            <button
              type="button"
              className={planTool === "furniture" ? "active" : ""}
              onClick={() => setPlanTool("furniture")}
            >{t("design.tool.furniture")}</button>
            <button
              type="button"
              className={planTool === "wall" ? "active" : ""}
              onClick={() => setPlanTool("wall")}
            >
              {t("design.drawWall")}
            </button>
          </div>

          <p className="muted design-architecture-hint">
            {planTool === "wall"
              ? t("design.wallHint", {
                  floor: activeArchitectureFloor + 1,
                  n: wallsThisFloor.length,
                })
              : t("design.switchToWall")}
          </p>
        </>
      ) : (
        <p className="muted">
          {t("design.defaultZonesNote")}
        </p>
      )}
    </section>
  );
}