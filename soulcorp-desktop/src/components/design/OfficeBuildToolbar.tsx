import { useOfficeBuildActions } from "../../hooks/useOfficeBuildActions";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";

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
  title: string;
  hint: string;
  view: OfficeWorkspaceView;
  drawerTab: OfficeDrawerTab;
}> = [
  {
    id: "size",
    title: "1 · Room size",
    hint: "Adjust lobby, corridor, and office zone areas",
    view: "plan",
    drawerTab: "room",
  },
  {
    id: "layout",
    title: "2 · Place furniture",
    hint: "Pick furniture · place and drag in plan or 3D · split view stays in sync",
    view: "split",
    drawerTab: "catalog",
  },
  {
    id: "preview",
    title: "3 · Preview theme",
    hint: "Split view sync · live StartupWarm interior preview",
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
    <header className="design-office-build-toolbar" aria-label="Office build toolbar">
      <div className="design-office-toolbar-top">
        <div className="design-office-toolbar-primary">
          <label className="design-office-building-select">
            <span className="design-office-toolbar-label">Edit office</span>
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
          <div className="design-office-toolbar-actions" aria-label="Build tools">
            <button type="button" className="design-office-tool-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
              ↶ Undo
            </button>
            <button type="button" className="design-office-tool-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
              ↷ Redo
            </button>
            <span className="design-office-toolbar-divider" aria-hidden />
            <button
              type="button"
              className="design-office-tool-btn"
              onClick={rotateSelected}
              disabled={!canEditSelection}
              title="Rotate (R)"
            >
              ⟳ Rotate
            </button>
            <button
              type="button"
              className="design-office-tool-btn"
              onClick={deleteSelected}
              disabled={!canEditSelection}
              title="Delete"
            >
              ✕ Delete
            </button>
          </div>
        </div>
        <p className="design-office-step-hint">{currentStep.hint}</p>
      </div>

      <div className="design-office-steps" role="tablist" aria-label="Office design steps">
        {STEPS.map((step) => (
          <button
            key={step.id}
            type="button"
            role="tab"
            aria-selected={activeStep === step.id}
            className={`design-office-step${activeStep === step.id ? " active" : ""}`}
            onClick={() => activateStep(step)}
          >
            <span className="design-office-step-title">{step.title}</span>
          </button>
        ))}
      </div>

      <div className="design-office-toolbar-meta">
        {building ? (
          <span className="design-office-building-note">
            {building.name}
            {placeCatalogId && activeStep === "layout" ? (
              <span className="design-office-placing-badge"> · Placement mode</span>
            ) : null}
          </span>
        ) : null}
        <div className="design-office-view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={workspaceView === "plan" ? "active" : ""}
            onClick={() => onWorkspaceViewChange("plan")}
          >
            Plan
          </button>
          <button
            type="button"
            className={workspaceView === "split" ? "active" : ""}
            onClick={() => onWorkspaceViewChange("split")}
          >
            Split
          </button>
          <button
            type="button"
            className={workspaceView === "3d" ? "active" : ""}
            onClick={() => onWorkspaceViewChange("3d")}
          >
            3D
          </button>
        </div>
      </div>
    </header>
  );
}