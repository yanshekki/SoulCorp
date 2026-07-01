import { audioDirector } from "../../audio/AudioDirector";
import { useGameStore } from "../../stores/gameStore";
import { furnitureInteractionHint } from "../../utils/furnitureInteractions";
import { tryExitInterior } from "../../utils/buildModeExit";
import type { InteriorZone } from "../../types/visualDesign";
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
  const interiorCameraMode = useGameStore((state) => state.interiorCameraMode);
  const setInteriorCameraMode = useGameStore((state) => state.setInteriorCameraMode);
  const interiorWalkZone = useGameStore((state) => state.interiorWalkZone);
  const requestInteriorWalkZone = useGameStore((state) => state.requestInteriorWalkZone);
  const requestInteriorScreenshot = useGameStore((state) => state.requestInteriorScreenshot);
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

  const walkZones: Array<{ id: InteriorZone; label: string }> = [
    { id: "lobby", label: "Lobby" },
    { id: "corridor", label: "Corridor" },
    { id: "office", label: "Office" },
  ];

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
            {interiorCameraMode === "walk"
              ? "Walk: WASD move · right-drag rotate · scroll zoom · walls auto-fade"
              : interiorCameraMode === "render"
                ? "Render: SSAO clarity · drag pan · right-drag rotate · scroll zoom · PNG screenshot"
                : "Iso: drag pan · scroll zoom · right-drag rotate · double-click reset"}
          </span>
        </div>
        <div className="interior-topbar-actions">
          {buildMode === "play" && interiorCameraMode === "walk" ? (
            <div className="interior-walk-zones" role="group" aria-label="Walk zones">
              {walkZones.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  className={interiorWalkZone === zone.id ? "active" : ""}
                  onClick={() => {
                    audioDirector.playSfx("ui_click");
                    requestInteriorWalkZone(zone.id);
                  }}
                >
                  {zone.label}
                </button>
              ))}
            </div>
          ) : null}
          {buildMode === "play" && interiorCameraMode === "render" ? (
            <button
              type="button"
              className="interior-screenshot-btn"
              onClick={() => {
                audioDirector.playSfx("ui_click");
                requestInteriorScreenshot();
              }}
            >
              Screenshot
            </button>
          ) : null}
          {buildMode === "play" ? (
            <div className="interior-camera-toggle" role="group" aria-label="Camera mode">
              <button
                type="button"
                className={interiorCameraMode === "iso" ? "active" : ""}
                onClick={() => {
                  audioDirector.playSfx("ui_click");
                  setInteriorCameraMode("iso");
                }}
              >
                Iso
              </button>
              <button
                type="button"
                className={interiorCameraMode === "walk" ? "active" : ""}
                onClick={() => {
                  audioDirector.playSfx("ui_click");
                  setInteriorCameraMode("walk");
                }}
              >
                Walk
              </button>
              <button
                type="button"
                className={interiorCameraMode === "render" ? "active" : ""}
                onClick={() => {
                  audioDirector.playSfx("ui_click");
                  setInteriorCameraMode("render");
                }}
              >
                Render
              </button>
            </div>
          ) : null}
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