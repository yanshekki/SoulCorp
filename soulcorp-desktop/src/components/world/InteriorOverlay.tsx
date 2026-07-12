import { audioDirector } from "../../audio/AudioDirector";
import { useGameStore } from "../../stores/gameStore";
import { furnitureInteractionHint } from "../../utils/furnitureInteractions";
import { tryExitInterior } from "../../utils/buildModeExit";
import type { InteriorZone } from "../../types/visualDesign";
import { AgentDetailPanel } from "./AgentDetailPanel";
import { BuildModeHud } from "./BuildModeHud";
import { FurnitureDetailPanel } from "./FurnitureDetailPanel";
import { useI18n } from "../../i18n/I18nProvider";

export function InteriorOverlay() {
  const { t } = useI18n();
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
    { id: "lobby", label: t("world.zone.lobby") },
    { id: "corridor", label: t("world.zone.corridor") },
    { id: "office", label: t("world.zone.office") },
  ];

  const playHint =
    buildMode === "play"
      ? hoveredCatalogId
        ? furnitureInteractionHint(hoveredCatalogId)
        : t("world.playHintDefault")
      : null;

  return (
    <>
      <header className="interior-topbar">
        <div className="interior-topbar-title">
          <span className="interior-topbar-eyebrow">{building?.department ?? t("world.department")}</span>
          <h2>{building?.name ?? t("world.interior")}</h2>
          {buildMode === "build" && buildDirty ? (
            <span className="interior-topbar-badge">{t("world.unsaved")}</span>
          ) : playHint ? (
            <span className="interior-topbar-hint">{playHint}</span>
          ) : null}
          <span className="interior-topbar-hint muted">
            {interiorCameraMode === "walk"
              ? t("world.camera.walkHint")
              : interiorCameraMode === "render"
                ? t("world.camera.renderHint")
                : t("world.camera.isoHint")}
          </span>
        </div>
        <div className="interior-topbar-actions">
          {buildMode === "play" && interiorCameraMode === "walk" ? (
            <div className="interior-walk-zones" role="group" aria-label={t("world.walkZones")}>
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
              {t("world.screenshot")}
            </button>
          ) : null}
          {buildMode === "play" ? (
            <div className="interior-camera-toggle" role="group" aria-label={t("world.cameraMode")}>
              <button
                type="button"
                className={interiorCameraMode === "iso" ? "active" : ""}
                onClick={() => {
                  audioDirector.playSfx("ui_click");
                  setInteriorCameraMode("iso");
                }}
              >{t("world.camera.iso")}</button>
              <button
                type="button"
                className={interiorCameraMode === "walk" ? "active" : ""}
                onClick={() => {
                  audioDirector.playSfx("ui_click");
                  setInteriorCameraMode("walk");
                }}
              >{t("world.camera.walk")}</button>
              <button
                type="button"
                className={interiorCameraMode === "render" ? "active" : ""}
                onClick={() => {
                  audioDirector.playSfx("ui_click");
                  setInteriorCameraMode("render");
                }}
              >{t("world.camera.render")}</button>
            </div>
          ) : null}
          <div className="interior-zoom-controls" aria-label={t("world.zoomControls")}>
            <button
              type="button"
              className="interior-zoom-btn"
              onClick={() => nudgeInteriorZoom(-0.12)}
              title={t("world.zoomOut")}
              aria-label={t("world.zoomOut")}
            >
              −
            </button>
            <button
              type="button"
              className="interior-zoom-btn"
              onClick={() => nudgeInteriorZoom(0.12)}
              title={t("world.zoomIn")}
              aria-label={t("world.zoomIn")}
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
          >{t("common.campus")}</button>
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