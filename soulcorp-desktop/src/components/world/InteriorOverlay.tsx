import { audioDirector } from "../../audio/AudioDirector";
import { useGameStore } from "../../stores/gameStore";
import { furnitureInteractionHint } from "../../utils/furnitureInteractions";
import { tryExitInterior } from "../../utils/buildModeExit";
import { AgentDetailPanel } from "./AgentDetailPanel";
import { BuildModeHud } from "./BuildModeHud";
import { FurnitureDetailPanel } from "./FurnitureDetailPanel";

export function InteriorOverlay() {
  const worldView = useGameStore((state) => state.worldView);
  const interiorBuildingId = useGameStore((state) => state.interiorBuildingId);
  const buildings = useGameStore((state) => state.buildings);
  const buildMode = useGameStore((state) => state.buildMode);
  const buildDirty = useGameStore((state) => state.buildDirty);
  const toggleBuildMode = useGameStore((state) => state.toggleBuildMode);
  const nudgeInteriorZoom = useGameStore((state) => state.nudgeInteriorZoom);
  const selectedAgentId = useGameStore((state) => state.selectedAgentId);
  const selectedFurnitureId = useGameStore((state) => state.selectedFurnitureId);
  const hoveredFurnitureId = useGameStore((state) => state.hoveredFurnitureId);
  const visualDesign = useGameStore((state) => state.visualDesign);

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

  return (
    <>
      <header className="interior-topbar">
        <div className="interior-topbar-title">
          <span className="interior-topbar-eyebrow">{building?.department ?? "Department"}</span>
          <h2>{building?.name ?? "Interior"}</h2>
          {buildMode === "build" && buildDirty ? (
            <span className="interior-topbar-badge">Unsaved</span>
          ) : playHint ? (
            <span className="interior-topbar-hint">{playHint}</span>
          ) : null}
          <span className="interior-topbar-hint muted">
            Left-drag pan · scroll/+− zoom · right-drag orbit · double-click reset
          </span>
        </div>
        <div className="interior-topbar-actions">
          <div className="interior-zoom-controls" aria-label="Zoom controls">
            <button
              type="button"
              className="interior-zoom-btn"
              onClick={() => nudgeInteriorZoom(-0.12)}
              title="Zoom out"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              className="interior-zoom-btn"
              onClick={() => nudgeInteriorZoom(0.12)}
              title="Zoom in"
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
          <button
            type="button"
            className={`build-hammer-btn${buildMode === "build" ? " active" : ""}`}
            onClick={() => {
              audioDirector.playSfx("ui_mode_switch");
              toggleBuildMode();
            }}
            title={buildMode === "build" ? "Exit build mode" : "Enter build mode"}
          >
            🔨 {buildMode === "build" ? "Build" : "Build"}
          </button>
          <button
            type="button"
            className="primary-action interior-back-btn"
            onClick={() => {
              audioDirector.playSfx("door_close");
              void tryExitInterior();
            }}
          >
            Campus
          </button>
        </div>
      </header>

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
    </>
  );
}