import { useOfficeBuildActions } from "../../hooks/useOfficeBuildActions";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import { useI18n } from "../../i18n/I18nProvider";

export type OfficeDrawerTab = "catalog" | "room" | "theme";
export type OfficeWorkspaceView = "3d" | "split" | "plan";
export type OfficeDesignStep = "size" | "layout" | "preview";

interface OfficeBuildToolbarProps {
  workspaceView: OfficeWorkspaceView;
  activeStep: OfficeDesignStep;
  onWorkspaceViewChange: (view: OfficeWorkspaceView) => void;
  onActiveStepChange: (step: OfficeDesignStep) => void;
  onDrawerTabChange: (tab: OfficeDrawerTab) => void;
  onDrawerOpenChange: (open: boolean) => void;
}

const STEPS: Array<{
  id: OfficeDesignStep;
  titleKey: string;
  hintKey: string;
  view: OfficeWorkspaceView;
  drawerTab: OfficeDrawerTab;
}> = [
  {
    id: "size",
    titleKey: "design.step.size",
    hintKey: "design.step.sizeHint",
    view: "plan",
    drawerTab: "room",
  },
  {
    id: "layout",
    titleKey: "design.step.layout",
    hintKey: "design.step.layoutHint",
    view: "split",
    drawerTab: "catalog",
  },
  {
    id: "preview",
    titleKey: "design.step.preview",
    hintKey: "design.step.previewHint",
    view: "split",
    drawerTab: "theme",
  },
];

export function OfficeBuildToolbar({
  workspaceView,
  activeStep,
  onWorkspaceViewChange,
  onActiveStepChange,
  onDrawerTabChange,
  onDrawerOpenChange,
}: OfficeBuildToolbarProps) {
  const { t } = useI18n();
  const buildings = useGameStore((state) => state.buildings);
  const selectedBuildingId = useDesignStudioStore((state) => state.selectedBuildingId);
  const setSelectedBuildingId = useDesignStudioStore((state) => state.setSelectedBuildingId);
  const placeCatalogId = useDesignStudioStore((state) => state.placeCatalogId);

  const buildingId = selectedBuildingId ?? buildings[0]?.id ?? "hq";
  const building = buildings.find((entry) => entry.id === buildingId);
  const currentStep = STEPS.find((step) => step.id === activeStep) ?? STEPS[0];
  const {
    undo,
    redo,
    rotateSelected,
    deleteSelected,
    canUndo,
    canRedo,
    canEditSelection,
  } = useOfficeBuildActions(buildingId, { keyboard: true });

  const activateStep = (step: (typeof STEPS)[number]) => {
    onActiveStepChange(step.id);
    onWorkspaceViewChange(step.view);
    onDrawerTabChange(step.drawerTab);
    onDrawerOpenChange(true);
  };

  return (
    <header className="design-office-build-toolbar" aria-label={t("design.officeBuildToolbar")}>
      <div className="design-office-toolbar-top">
        <div className="design-office-toolbar-primary">
          <label className="design-office-building-select">
            <span className="design-office-toolbar-label">{t("design.editOffice")}</span>
            <select
              value={buildingId}
              onChange={(event) => setSelectedBuildingId(event.target.value)}
            >
              {buildings.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="design-office-toolbar-actions" aria-label={t("design.buildTools")}>
            <button type="button" className="design-office-tool-btn" onClick={undo} disabled={!canUndo} title={t("design.undoTitle")}>
              ↶ {t("design.undo")}
            </button>
            <button type="button" className="design-office-tool-btn" onClick={redo} disabled={!canRedo} title={t("design.redoTitle")}>
              ↷ {t("design.redo")}
            </button>
            <span className="design-office-toolbar-divider" aria-hidden />
            <button
              type="button"
              className="design-office-tool-btn"
              onClick={rotateSelected}
              disabled={!canEditSelection}
              title={t("design.rotateTitle")}
            >
              ⟳ {t("design.rotate")}
            </button>
            <button
              type="button"
              className="design-office-tool-btn"
              onClick={deleteSelected}
              disabled={!canEditSelection}
              title={t("design.delete")}
            >
              ✕ {t("design.delete")}
            </button>
          </div>
        </div>
        <p className="design-office-step-hint">{t(currentStep.hintKey)}</p>
      </div>

      <div className="design-office-steps" role="tablist" aria-label={t("design.officeSteps")}>
        {STEPS.map((step) => (
          <button
            key={step.id}
            type="button"
            role="tab"
            aria-selected={activeStep === step.id}
            className={`design-office-step${activeStep === step.id ? " active" : ""}`}
            onClick={() => activateStep(step)}
          >
            <span className="design-office-step-title">{t(step.titleKey)}</span>
          </button>
        ))}
      </div>

      <div className="design-office-toolbar-meta">
        {building ? (
          <span className="design-office-building-note">
            {building.name}
            {placeCatalogId && activeStep === "layout" ? (
              <span className="design-office-placing-badge"> · {t("design.placementMode")}</span>
            ) : null}
          </span>
        ) : null}
        <div className="design-office-view-toggle" role="group" aria-label={t("design.viewMode")}>
          <button
            type="button"
            className={workspaceView === "plan" ? "active" : ""}
            onClick={() => onWorkspaceViewChange("plan")}
          >
            {t("design.view.plan")}
          </button>
          <button
            type="button"
            className={workspaceView === "split" ? "active" : ""}
            onClick={() => onWorkspaceViewChange("split")}
          >
            {t("design.view.split")}
          </button>
          <button
            type="button"
            className={workspaceView === "3d" ? "active" : ""}
            onClick={() => onWorkspaceViewChange("3d")}
          >
            {t("design.view.3d")}
          </button>
        </div>
      </div>
    </header>
  );
}