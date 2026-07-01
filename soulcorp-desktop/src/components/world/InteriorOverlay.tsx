import { audioDirector } from "../../audio/AudioDirector";
import { useGameStore } from "../../stores/gameStore";
import { furnitureInteractionHint } from "../../utils/furnitureInteractions";
import { tryExitInterior } from "../../utils/buildModeExit";
import { AgentDetailPanel } from "./AgentDetailPanel";
import { BuildModeHud } from "./BuildModeHud";
import { FurnitureDetailPanel } from "./FurnitureDetailPanel";
import { TPHGameDock } from "./TPHGameDock";
import { TPHStatsPanel } from "./TPHStatsPanel";

export function InteriorOverlay() {
  const worldView = useGameStore((state) => state.worldView);
  const interiorBuildingId = useGameStore((state) => state.interiorBuildingId);
  const buildings = useGameStore((state) => state.buildings);
  const buildMode = useGameStore((state) => state.buildMode);
  const buildDirty = useGameStore((state) => state.buildDirty);
  const toggleBuildMode = useGameStore((state) => state.toggleBuildMode);
  const nudgeInteriorZoom = useGameStore((state) => state.nudgeInteriorZoom);
  const interiorCameraMode = useGameStore((state) => state.interiorCameraMode);
  const setInteriorCameraMode = useGameStore((state) => state.setInteriorCameraMode);
  const requestInteriorScreenshot = useGameStore((state) => state.requestInteriorScreenshot);
  const selectedAgentId = useGameStore((state) => state.selectedAgentId);
  const selectedFurnitureId = useGameStore((state) => state.selectedFurnitureId);
  const hoveredFurnitureId = useGameStore((state) => state.hoveredFurnitureId);
  const visualDesign = useGameStore((state) => state.visualDesign);
  const setInspectorExpanded = useGameStore((state) => state.setInspectorExpanded);

  if (worldView !== "interior" || !interiorBuildingId) {
    return null;
  }

  const building = buildings.find((b) => b.id === interiorBuildingId);
  const office = visualDesign.offices[interiorBuildingId];
  const hoveredItem = office?.furniture.find((item) => item.id === hoveredFurnitureId);
  const hoveredCatalogId = hoveredItem?.catalog_id ?? null;

  const playHint =
    buildMode === "play"
      ? hoveredCatalogId
        ? furnitureInteractionHint(hoveredCatalogId)
        : "Click desks, equipment, or agents"
      : null;

  const cameraHint =
    interiorCameraMode === "walk"
      ? "WASD · right-drag rotate · scroll zoom"
      : interiorCameraMode === "render"
        ? "SSAO · drag pan · PNG screenshot"
        : "Drag pan · scroll zoom · double-click reset";

  return (
    <div className="tph-game-chrome">
      <header className="tph-top-ribbon">
        <div className="tph-ribbon-main">
          <span className="tph-ribbon-dept">{building?.department ?? "Department"}</span>
          <h2 className="tph-ribbon-title">{building?.name ?? "Interior"}</h2>
          {buildMode === "build" && buildDirty ? (
            <span className="tph-ribbon-badge">Unsaved</span>
          ) : playHint ? (
            <span className="tph-ribbon-hint">{playHint}</span>
          ) : null}
        </div>

        <div className="tph-ribbon-tools">
          {buildMode === "play" ? (
            <div className="tph-ribbon-toggle" role="group" aria-label="Camera mode">
              {(["iso", "walk", "render"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={interiorCameraMode === mode ? "active" : ""}
                  onClick={() => {
                    audioDirector.playSfx("ui_click");
                    setInteriorCameraMode(mode);
                  }}
                >
                  {mode === "iso" ? "Iso" : mode === "walk" ? "Walk" : "Render"}
                </button>
              ))}
            </div>
          ) : null}
          {buildMode === "play" && interiorCameraMode === "render" ? (
            <button
              type="button"
              className="tph-ribbon-btn"
              onClick={() => {
                audioDirector.playSfx("ui_click");
                requestInteriorScreenshot();
              }}
            >
              Screenshot
            </button>
          ) : null}
          <div className="tph-zoom-group" aria-label="Zoom">
            <button
              type="button"
              className="tph-zoom-btn"
              onClick={() => nudgeInteriorZoom(-0.12)}
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              className="tph-zoom-btn"
              onClick={() => nudgeInteriorZoom(0.12)}
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
          {buildMode === "build" ? (
            <button
              type="button"
              className="tph-ribbon-btn tph-ribbon-btn--gold"
              onClick={() => {
                audioDirector.playSfx("ui_mode_switch");
                toggleBuildMode();
              }}
            >
              Exit build
            </button>
          ) : null}
          <button
            type="button"
            className="tph-ribbon-btn tph-ribbon-btn--campus"
            onClick={() => {
              audioDirector.playSfx("door_close");
              void tryExitInterior();
            }}
          >
            Campus
          </button>
        </div>
        <p className="tph-ribbon-subhint">{cameraHint}</p>
      </header>

      {buildMode !== "build" ? (
        <TPHGameDock onOpenInspector={() => setInspectorExpanded(true)} />
      ) : null}

      <TPHStatsPanel />

      {selectedFurnitureId && office ? (
        <div className="interior-side-panel interior-side-panel--right">
          <FurnitureDetailPanel
            buildingId={interiorBuildingId}
            furnitureId={selectedFurnitureId}
            office={office}
          />
        </div>
      ) : null}
      {buildMode === "play" && selectedAgentId ? (
        <div className="interior-side-panel interior-side-panel--right">
          <AgentDetailPanel agentId={selectedAgentId} />
        </div>
      ) : null}

      <BuildModeHud />
    </div>
  );
}