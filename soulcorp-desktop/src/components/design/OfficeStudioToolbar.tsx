import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";

export type OfficeDrawerTab = "catalog" | "room" | "theme";
export type OfficeWorkspaceView = "3d" | "split" | "plan";
export type OfficeDesignStep = "size" | "layout" | "preview";

interface OfficeStudioToolbarProps {
  workspaceView: OfficeWorkspaceView;
  activeStep: OfficeDesignStep;
  drawerTab: OfficeDrawerTab;
  drawerOpen: boolean;
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
    title: "1 · 房間大小",
    hint: "調整大堂、走廊、辦公區面積",
    view: "plan",
    drawerTab: "room",
  },
  {
    id: "layout",
    title: "2 · 平面佈置",
    hint: "揀傢俬，喺平面圖撳一下放置",
    view: "plan",
    drawerTab: "catalog",
  },
  {
    id: "preview",
    title: "3 · 3D 預覽",
    hint: "即時睇室內效果",
    view: "split",
    drawerTab: "theme",
  },
];

export function OfficeStudioToolbar({
  workspaceView,
  activeStep,
  drawerTab: _drawerTab,
  drawerOpen: _drawerOpen,
  onWorkspaceViewChange,
  onActiveStepChange,
  onDrawerTabChange,
  onDrawerOpenChange,
}: OfficeStudioToolbarProps) {
  const buildings = useGameStore((state) => state.buildings);
  const selectedBuildingId = useDesignStudioStore((state) => state.selectedBuildingId);
  const setSelectedBuildingId = useDesignStudioStore((state) => state.setSelectedBuildingId);
  const placeCatalogId = useDesignStudioStore((state) => state.placeCatalogId);

  const buildingId = selectedBuildingId ?? buildings[0]?.id ?? "hq";
  const building = buildings.find((entry) => entry.id === buildingId);
  const currentStep = STEPS.find((step) => step.id === activeStep) ?? STEPS[0];

  const activateStep = (step: (typeof STEPS)[number]) => {
    onActiveStepChange(step.id);
    onWorkspaceViewChange(step.view);
    onDrawerTabChange(step.drawerTab);
    onDrawerOpenChange(true);
  };

  return (
    <div className="design-office-toolbar">
      <div className="design-office-toolbar-top">
        <label className="design-office-building-select">
          <span className="design-office-toolbar-label">編輯邊間辦公室</span>
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
              <span className="design-office-placing-badge"> · 放置模式</span>
            ) : null}
          </span>
        ) : null}
        <div className="design-office-view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={workspaceView === "plan" ? "active" : ""}
            onClick={() => onWorkspaceViewChange("plan")}
          >
            平面
          </button>
          <button
            type="button"
            className={workspaceView === "split" ? "active" : ""}
            onClick={() => onWorkspaceViewChange("split")}
          >
            分屏
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
    </div>
  );
}