import { useEffect, useRef } from "react";
import * as THREE from "three";
import { audioDirector } from "../../audio/AudioDirector";
import { run3dSmokeTestFromCanvas } from "../../services/scene3dSmoke";
import { useGameStore } from "../../stores/gameStore";
import { agentRuntimeRef } from "../../utils/agentRuntime";
import { INTERIOR_LAYOUT_VERSION } from "../../utils/interiorScale";
import { normalizeOfficeVisual } from "../../utils/officeVisualNormalize";
import {
  deleteFurniture,
  moveFurniture,
  placeFurniture,
  rotateFurniture,
} from "../../utils/buildModeActions";
import { tryExitInterior } from "../../utils/buildModeExit";
import { handleFurnitureClick } from "../../utils/furnitureInteractions";
import { patchOfficeVisual } from "../../utils/syncVisualDesign";
import { DEFAULT_OFFICE_VISUAL, type OfficeVisualConfig } from "../../types/visualDesign";
import {
  applyInteriorPan,
  applyOrbitToCamera,
  applyOrbitToPerspectiveCamera,
  applyWalkToPerspectiveCamera,
  clampInteriorZoom,
  createGameInteriorOrbit,
  createInteriorOrbitForMode,
  interiorFrustumForOrbit,
  interiorSceneFocusZ,
  lerpGameInteriorCamera,
  lerpWalkInteriorCamera,
  snapIsometricAzimuth,
  type InteriorOrbitState,
} from "../../utils/interiorCamera";
import {
  applyWalkKeyboardMove,
  clampWalkPan,
  emptyWalkKeys,
  interiorZoneCenterPan,
  walkZoneAtPan,
  type WalkKeyState,
} from "../../utils/interiorWalkControls";
import {
  canvasToPngDataUrl,
  downloadPngDataUrl,
  interiorScreenshotFilename,
} from "../../utils/interiorScreenshot";
import { FURNITURE_CATALOG } from "../../data/furnitureCatalog";
import { invalidateCampusNavGrid } from "../../utils/campusNavGrid";
import { createCampusScene, type CampusSceneHandles } from "./campusScene";
import { initFurnitureKtx2Support, preloadFurnitureCatalog } from "./gltfAssetLoader";
import { resolveFurnitureGltfPath } from "../../utils/furnitureAssetPath";
import {
  createInteriorScene,
  type FloorHit,
  type FurnitureHit,
  type InteriorSceneHandles,
} from "./interiorScene";
import { LabelSystem } from "./labelSystem";
import { clearParticleBursts, spawnParticleBurst, tickParticleBursts } from "./particleBurst";
import { syncSceneAgents } from "./threeOfficeScene";

export type RenderStatus = "initializing" | "ready" | "failed";

interface ThreeOfficeRendererProps {
  width: number;
  height: number;
  onStatusChange: (status: RenderStatus, error?: string) => void;
}

const CAMPUS_CAMERA = new THREE.Vector3(14, 14, 14);
const cameraTarget = new THREE.Vector3();
const cameraDesired = new THREE.Vector3();
const INTERIOR_DRAG_THRESHOLD_PX = 6;

type InteriorPendingPointerAction =
  | { type: "furniture"; hit: FurnitureHit; buildingId: string }
  | { type: "agent"; agentId: string }
  | { type: "select_furniture"; furnitureId: string }
  | {
      type: "place";
      buildingId: string;
      catalogId: string;
      floorHit: FloorHit;
    };

interface InteriorPanDragState {
  dragging: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  pending: InteriorPendingPointerAction | null;
}

interface CampusCameraState {
  frustum: number;
  panX: number;
  panZ: number;
}

function applyCampusFrustum(
  camera: THREE.OrthographicCamera,
  aspect: number,
  frustum: number,
) {
  camera.left = (-frustum * aspect) / 2;
  camera.right = (frustum * aspect) / 2;
  camera.top = frustum / 2;
  camera.bottom = -frustum / 2;
  camera.updateProjectionMatrix();
}

function updateCampusCamera(
  camera: THREE.OrthographicCamera,
  selectedBuilding: { position: [number, number, number] } | null,
  delta: number,
  cameraState: CampusCameraState,
) {
  cameraTarget.set(cameraState.panX, 0, cameraState.panZ);
  if (selectedBuilding) {
    const [x, , z] = selectedBuilding.position;
    cameraTarget.x += x;
    cameraTarget.z += z;
    cameraDesired.set(cameraTarget.x + 7, 10, cameraTarget.z + 7);
    camera.position.lerp(cameraDesired, Math.min(delta * 2.5, 1));
    camera.lookAt(cameraTarget);
    return;
  }
  cameraDesired.copy(CAMPUS_CAMERA).add(cameraTarget);
  camera.position.lerp(cameraDesired, Math.min(delta * 2, 1));
  camera.lookAt(cameraTarget);
}

function updateInteriorCamera(
  camera: THREE.OrthographicCamera,
  office: OfficeVisualConfig,
  orbit: InteriorOrbitState,
  transition: number,
  delta: number,
) {
  if (transition < 1) {
    const nextT = lerpGameInteriorCamera(camera, office, orbit, transition, delta);
    useGameStore.getState().setCameraTransition(nextT);
    return;
  }
  applyOrbitToCamera(camera, orbit, interiorSceneFocusZ());
}

export function ThreeOfficeRenderer({
  width,
  height,
  onStatusChange,
}: ThreeOfficeRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const campusRef = useRef<CampusSceneHandles | null>(null);
  const interiorRef = useRef<InteriorSceneHandles | null>(null);
  const labelsRef = useRef<LabelSystem | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef(performance.now());
  const buildingsSignatureRef = useRef("");
  const interiorSignatureRef = useRef("");
  const onStatusChangeRef = useRef(onStatusChange);
  const smokeFramesRef = useRef(0);
  const smokeDoneRef = useRef(false);
  const campusCameraRef = useRef<CampusCameraState>({ frustum: 14, panX: 0, panZ: 0 });
  const campusPanRef = useRef<{ dragging: boolean; lastX: number; lastY: number } | null>(null);
  const interiorOrbitRef = useRef<InteriorOrbitState | null>(null);
  const interiorOrbitDragRef = useRef<{ dragging: boolean; lastX: number; lastY: number } | null>(
    null,
  );
  const lastInteriorCameraModeRef = useRef<import("../../stores/gameStore").InteriorCameraMode>("iso");
  const lastScreenshotEpochRef = useRef(0);
  const walkKeysRef = useRef<WalkKeyState>(emptyWalkKeys());
  const lastWalkZoneRef = useRef<import("../../types/visualDesign").InteriorZone>("office");
  const interiorPanDragRef = useRef<InteriorPanDragState | null>(null);
  const lastInteriorBuildingRef = useRef<string | null>(null);
  const lastInteriorViewEpochRef = useRef(-1);
  const dragFurnitureRef = useRef<{
    furnitureId: string;
    zone: import("../../types/visualDesign").InteriorZone;
  } | null>(null);
  const dragPreviewRef = useRef<[number, number, number] | null>(null);
  const viewSizeRef = useRef({ width, height });
  viewSizeRef.current = { width, height };

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const { width: initWidth, height: initHeight } = viewSizeRef.current;
    if (!canvas || !parent || initWidth < 80 || initHeight < 80) {
      return;
    }

    let disposed = false;
    onStatusChangeRef.current("initializing");
    buildingsSignatureRef.current = "";
    interiorSignatureRef.current = "";

    try {
      const { visualDesign, settings } = useGameStore.getState();
      campusRef.current = createCampusScene(
        canvas,
        initWidth,
        initHeight,
        visualDesign.campus,
        settings.low_power_mode,
      );
      interiorRef.current = createInteriorScene(canvas, initWidth, initHeight);
      initFurnitureKtx2Support(interiorRef.current.renderer);
      labelsRef.current = new LabelSystem(parent);
      void preloadFurnitureCatalog(
        FURNITURE_CATALOG.map((entry) => ({
          gltfPath: resolveFurnitureGltfPath(entry),
          footprint: entry.footprint,
        })),
      );
      onStatusChangeRef.current("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onStatusChangeRef.current("failed", message);
      return;
    }

    const loop = (time: number) => {
      if (disposed) {
        return;
      }
      const { width: viewWidth, height: viewHeight } = viewSizeRef.current;
      const delta = Math.min((time - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = time;

      const state = useGameStore.getState();
      const agents =
        agentRuntimeRef.current.length > 0 ? agentRuntimeRef.current : state.agents;
      const lowPower = state.settings.low_power_mode;
      const worldView = state.worldView;

      if (worldView === "campus" && campusRef.current) {
        lastInteriorBuildingRef.current = null;
        interiorOrbitRef.current = null;
        const signature = state.buildings
          .map((b) => {
            const cfg = state.visualDesign.buildings[b.id];
            return `${b.id}:${b.color}:${b.roofColor}:${b.accentColor}:${b.size.join(",")}:${b.name}:${cfg?.style ?? "modern"}`;
          })
          .join("|");

        if (signature !== buildingsSignatureRef.current) {
          buildingsSignatureRef.current = signature;
          invalidateCampusNavGrid();
          campusRef.current.syncBuildings(
            state.buildings,
            state.visualDesign.buildings,
            state.visualDesign.campus,
            state.hoveredDoorBuildingId,
          );
        } else if (state.hoveredDoorBuildingId) {
          campusRef.current.syncBuildings(
            state.buildings,
            state.visualDesign.buildings,
            state.visualDesign.campus,
            state.hoveredDoorBuildingId,
          );
        }

        campusRef.current.syncTheme(state.visualDesign.campus, lowPower);
        campusRef.current.setVisualStyle({
          cozyEffects: !lowPower,
          crtFilter: state.settings.crt_filter_enabled,
        });
        const aspect = viewWidth / Math.max(viewHeight, 1);
        applyCampusFrustum(
          campusRef.current.camera,
          aspect,
          campusCameraRef.current.frustum,
        );
        syncSceneAgents(
          campusRef.current,
          agents,
          lowPower,
          state.settings.pixel_filter_enabled,
        );
        updateCampusCamera(
          campusRef.current.camera,
          state.selectedBuilding,
          delta,
          campusCameraRef.current,
        );
        tickParticleBursts(delta);
        campusRef.current.renderFrame();

        labelsRef.current?.sync(state.buildings, state.hoveredDoorBuildingId);
        labelsRef.current?.attachToScene(campusRef.current.scene, state.buildings);
        labelsRef.current?.render(
          campusRef.current.scene,
          campusRef.current.camera,
          viewWidth,
          viewHeight,
        );
      } else if (worldView === "interior" && interiorRef.current) {
        const building = state.buildings.find((b) => b.id === state.interiorBuildingId);
        if (building) {
          const office = normalizeOfficeVisual(
            state.visualDesign.offices[building.id] ?? DEFAULT_OFFICE_VISUAL,
            building.id,
          );
          const walkMode = state.interiorCameraMode === "walk" && state.buildMode === "play";
          const renderMode = state.interiorCameraMode === "render" && state.buildMode === "play";
          interiorRef.current.setVisualStyle({
            pixelAgents: state.settings.pixel_filter_enabled,
            cozyEffects: !state.settings.low_power_mode && !renderMode,
            crtFilter: state.settings.crt_filter_enabled && !renderMode,
            walkMode,
            renderMode,
          });
          if (state.interiorCameraMode !== lastInteriorCameraModeRef.current) {
            lastInteriorCameraModeRef.current = state.interiorCameraMode;
            interiorOrbitRef.current = createInteriorOrbitForMode(office, state.interiorCameraMode);
            if (state.interiorCameraMode === "walk") {
              lastWalkZoneRef.current = "office";
              interiorRef.current.setFocusZone("office");
              state.setInteriorWalkZone("office");
              walkKeysRef.current = emptyWalkKeys();
            }
            if (state.interiorCameraMode === "render") {
              interiorRef.current.setFocusZone("office");
              walkKeysRef.current = emptyWalkKeys();
            }
          }
          const sig = JSON.stringify({
            layout: INTERIOR_LAYOUT_VERSION,
            building: building.id,
            office,
            agents: agents.length,
            pixel: state.settings.pixel_filter_enabled,
          });
          if (sig !== interiorSignatureRef.current) {
            interiorSignatureRef.current = sig;
            void interiorRef.current.rebuild(
              building,
              office,
              agents,
              state.agentRecords,
              state.companyName,
            );
          }
          if (state.interiorViewEpoch !== lastInteriorViewEpochRef.current) {
            lastInteriorViewEpochRef.current = state.interiorViewEpoch;
            lastInteriorBuildingRef.current = building.id;
            interiorSignatureRef.current = "";
            interiorOrbitRef.current = createInteriorOrbitForMode(office, state.interiorCameraMode);
          } else if (lastInteriorBuildingRef.current !== building.id) {
            lastInteriorBuildingRef.current = building.id;
            interiorOrbitRef.current = createInteriorOrbitForMode(office, state.interiorCameraMode);
          }
          const orbit =
            interiorOrbitRef.current ??
            createInteriorOrbitForMode(office, state.interiorCameraMode);
          if (state.interiorZoomNudge !== 0) {
            orbit.zoom = clampInteriorZoom(orbit.zoom + state.interiorZoomNudge);
            state.clearInteriorZoomNudge();
            state.setCameraTransition(1);
          }
          if (walkMode && state.interiorWalkFocusZone) {
            const pan = interiorZoneCenterPan(office, state.interiorWalkFocusZone);
            orbit.panX = pan.panX;
            orbit.panZ = pan.panZ;
            interiorRef.current.setFocusZone(state.interiorWalkFocusZone);
            lastWalkZoneRef.current = state.interiorWalkFocusZone;
            state.setInteriorWalkZone(state.interiorWalkFocusZone);
            state.clearInteriorWalkFocusZone();
          }
          if (walkMode) {
            if (applyWalkKeyboardMove(orbit, walkKeysRef.current, delta)) {
              clampWalkPan(orbit, office);
              state.setCameraTransition(1);
            }
            const walkZone = walkZoneAtPan(office, orbit.panX, orbit.panZ);
            if (walkZone !== lastWalkZoneRef.current) {
              lastWalkZoneRef.current = walkZone;
              interiorRef.current.setFocusZone(walkZone);
              state.setInteriorWalkZone(walkZone);
            }
          }
          const interiorCamera = interiorRef.current.camera;
          if (walkMode && interiorCamera instanceof THREE.PerspectiveCamera) {
            if (state.cameraTransition < 1) {
              const nextT = lerpWalkInteriorCamera(
                interiorCamera,
                office,
                orbit,
                state.cameraTransition,
                delta,
              );
              state.setCameraTransition(nextT);
            } else {
              applyWalkToPerspectiveCamera(interiorCamera, orbit, office);
            }
          } else if (renderMode && interiorCamera instanceof THREE.PerspectiveCamera) {
            applyOrbitToPerspectiveCamera(interiorCamera, orbit, interiorSceneFocusZ());
            state.setCameraTransition(1);
          } else if (interiorCamera instanceof THREE.OrthographicCamera) {
            updateInteriorCamera(
              interiorCamera,
              office,
              orbit,
              state.cameraTransition,
              delta,
            );
          }
          interiorRef.current.syncCamera(
            office,
            viewWidth,
            viewHeight,
            interiorFrustumForOrbit(office, orbit),
          );
          interiorRef.current.tick(delta, agents);
          tickParticleBursts(delta);
          interiorRef.current.renderFrame();
          if (
            renderMode &&
            state.interiorScreenshotEpoch > 0 &&
            state.interiorScreenshotEpoch !== lastScreenshotEpochRef.current
          ) {
            lastScreenshotEpochRef.current = state.interiorScreenshotEpoch;
            const dataUrl = canvasToPngDataUrl(canvas);
            downloadPngDataUrl(dataUrl, interiorScreenshotFilename(building.id));
            audioDirector.playSfx("ui_click");
            state.setStatusMessage("Office screenshot saved");
          }
        }
      }

      if (!smokeDoneRef.current && worldView === "campus") {
        smokeFramesRef.current += 1;
        if (smokeFramesRef.current >= 45) {
          smokeDoneRef.current = true;
          void run3dSmokeTestFromCanvas(canvas);
        }
      }

      frameRef.current = requestAnimationFrame(loop);
    };

    lastTimeRef.current = performance.now();
    frameRef.current = requestAnimationFrame(loop);

    const normalizedPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      };
    };

    const startInteriorPanDrag = (
      event: PointerEvent,
      pending: InteriorPendingPointerAction | null,
    ) => {
      interiorPanDragRef.current = {
        dragging: true,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false,
        pending,
      };
    };

    const applyInteriorPanDrag = (event: PointerEvent): boolean => {
      const pan = interiorPanDragRef.current;
      const orbit = interiorOrbitRef.current;
      if (!pan?.dragging || !orbit) {
        return false;
      }
      const totalDx = event.clientX - pan.startX;
      const totalDy = event.clientY - pan.startY;
      if (
        !pan.moved &&
        (Math.abs(totalDx) > INTERIOR_DRAG_THRESHOLD_PX ||
          Math.abs(totalDy) > INTERIOR_DRAG_THRESHOLD_PX)
      ) {
        pan.moved = true;
        pan.pending = null;
      }
      if (!pan.moved) {
        return false;
      }
      const dx = event.clientX - pan.lastX;
      const dy = event.clientY - pan.lastY;
      pan.lastX = event.clientX;
      pan.lastY = event.clientY;
      const state = useGameStore.getState();
      const buildingId = state.interiorBuildingId;
      if (!buildingId) {
        return true;
      }
      const office = normalizeOfficeVisual(
        state.visualDesign.offices[buildingId] ?? DEFAULT_OFFICE_VISUAL,
        buildingId,
      );
      const frustum = interiorFrustumForOrbit(office, orbit);
      const rect = canvas.getBoundingClientRect();
      applyInteriorPan(orbit, dx, dy, rect.width, frustum);
      state.setCameraTransition(1);
      canvas.style.cursor = "grabbing";
      return true;
    };

    const resolveInteriorPendingAction = (pending: InteriorPendingPointerAction) => {
      const state = useGameStore.getState();
      switch (pending.type) {
        case "furniture":
          void handleFurnitureClick(pending.hit, pending.buildingId);
          break;
        case "agent":
          audioDirector.playSfx("agent_select");
          state.selectAgent(pending.agentId);
          state.setSelectedFurnitureId(null);
          break;
        case "select_furniture":
          state.setSelectedFurnitureId(pending.furnitureId);
          break;
        case "place": {
          const office = normalizeOfficeVisual(
            state.visualDesign.offices[pending.buildingId] ?? DEFAULT_OFFICE_VISUAL,
            pending.buildingId,
          );
          const next = placeFurniture(
            office,
            pending.buildingId,
            pending.catalogId,
            pending.floorHit.zone,
            pending.floorHit.localPosition,
          );
          if (next && interiorRef.current) {
            patchOfficeVisual(pending.buildingId, { furniture: next });
            audioDirector.playSfx("furniture_place");
            spawnParticleBurst(
              interiorRef.current.scene,
              pending.floorHit.worldPosition,
              office.accent_color,
              8,
            );
            state.addRecentBuildCatalog(pending.catalogId);
            const placed = next[next.length - 1];
            state.setSelectedFurnitureId(placed.id);
            interiorSignatureRef.current = "";
          }
          break;
        }
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const state = useGameStore.getState();
      const { x, y } = normalizedPointer(event);

      if (state.worldView === "interior" && interiorRef.current) {
        if (applyInteriorPanDrag(event)) {
          return;
        }

        if (state.buildMode === "build") {
          const furnitureHit = interiorRef.current.raycastFurniture(x, y);
          const nextHover = furnitureHit?.furnitureId ?? null;
          if (nextHover !== state.hoveredFurnitureId) {
            state.setHoveredFurnitureId(nextHover);
          }
          interiorRef.current.setFurnitureHighlight(
            state.selectedFurnitureId ?? state.hoveredFurnitureId,
          );

          const floorHit = interiorRef.current.raycastFloor(x, y);
          if (state.buildTool === "place" && state.buildCatalogId && floorHit) {
            interiorRef.current.updateGhostPreview(
              state.buildCatalogId,
              floorHit.zone,
              floorHit.localPosition,
            );
            canvas.style.cursor = "copy";
          } else if (dragFurnitureRef.current && floorHit) {
            dragPreviewRef.current = floorHit.localPosition;
            const buildingId = state.interiorBuildingId;
            let draggedCatalogId: string | null = null;
            let draggedRotation = 0;
            if (buildingId) {
              const office = normalizeOfficeVisual(
                state.visualDesign.offices[buildingId] ?? DEFAULT_OFFICE_VISUAL,
                buildingId,
              );
              const dragged = office.furniture.find(
                (item) => item.id === dragFurnitureRef.current?.furnitureId,
              );
              draggedCatalogId = dragged?.catalog_id ?? null;
              draggedRotation = dragged?.rotation_y ?? 0;
            }
            interiorRef.current.updateGhostPreview(
              draggedCatalogId,
              dragFurnitureRef.current.zone,
              floorHit.localPosition,
              draggedRotation,
            );
            canvas.style.cursor = "grabbing";
          } else {
            interiorRef.current.updateGhostPreview(null, null, null);
            canvas.style.cursor = furnitureHit ? "pointer" : "crosshair";
          }
          return;
        }

        const furnitureHit = interiorRef.current.raycastFurniture(x, y);
        const nextHover = furnitureHit?.furnitureId ?? null;
        if (nextHover !== state.hoveredFurnitureId) {
          state.setHoveredFurnitureId(nextHover);
        }
        interiorRef.current.setPlayFurnitureHover(nextHover);
        const agentHover = interiorRef.current.raycastAgent(x, y);
        canvas.style.cursor = furnitureHit || agentHover ? "pointer" : "default";
        return;
      }

      if (state.worldView !== "campus" || !campusRef.current) {
        return;
      }
      const doorBuilding = campusRef.current.raycastDoor(x, y);
      const nextHover = doorBuilding?.id ?? null;
      if (nextHover !== state.hoveredDoorBuildingId) {
        state.setHoveredDoorBuildingId(nextHover);
        canvas.style.cursor = nextHover ? "pointer" : "default";
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const state = useGameStore.getState();
      const { x, y } = normalizedPointer(event);

      if (state.worldView === "interior" && interiorRef.current) {
        if (event.button !== 0) {
          return;
        }

        audioDirector.unlock();
        if (interiorRef.current.raycastExit(x, y)) {
          audioDirector.playSfx("door_close");
          void tryExitInterior();
          return;
        }

        const buildingId = state.interiorBuildingId;
        if (!buildingId) {
          return;
        }

        if (state.buildMode === "build") {
          const office = normalizeOfficeVisual(
            state.visualDesign.offices[buildingId] ?? DEFAULT_OFFICE_VISUAL,
            buildingId,
          );
          const furnitureHit = interiorRef.current.raycastFurniture(x, y);
          const floorHit = interiorRef.current.raycastFloor(x, y);

          if (state.buildTool === "delete" && furnitureHit) {
            const next = deleteFurniture(office, furnitureHit.furnitureId);
            patchOfficeVisual(buildingId, { furniture: next });
            audioDirector.playSfx("furniture_delete");
            state.setSelectedFurnitureId(null);
            interiorSignatureRef.current = "";
            return;
          }

          if (state.buildTool === "rotate" && furnitureHit) {
            const next = rotateFurniture(office, furnitureHit.furnitureId);
            if (next) {
              patchOfficeVisual(buildingId, { furniture: next });
              audioDirector.playSfx("furniture_place");
              state.setSelectedFurnitureId(furnitureHit.furnitureId);
              interiorSignatureRef.current = "";
            }
            return;
          }

          if (state.buildTool === "move" && furnitureHit) {
            dragFurnitureRef.current = {
              furnitureId: furnitureHit.furnitureId,
              zone: furnitureHit.zone,
            };
            dragPreviewRef.current = furnitureHit.localPosition;
            state.setSelectedFurnitureId(furnitureHit.furnitureId);
            return;
          }

          if (state.buildTool === "place" && state.buildCatalogId && floorHit) {
            startInteriorPanDrag(event, {
              type: "place",
              buildingId,
              catalogId: state.buildCatalogId,
              floorHit,
            });
            return;
          }

          startInteriorPanDrag(
            event,
            furnitureHit
              ? { type: "select_furniture", furnitureId: furnitureHit.furnitureId }
              : null,
          );
          return;
        }

        const furnitureHit = interiorRef.current.raycastFurniture(x, y);
        const agentId = interiorRef.current.raycastAgent(x, y);
        startInteriorPanDrag(
          event,
          furnitureHit
            ? { type: "furniture", hit: furnitureHit, buildingId }
            : agentId
              ? { type: "agent", agentId }
              : null,
        );
        return;
      }

      if (!campusRef.current) {
        return;
      }

      const doorBuilding = campusRef.current.raycastDoor(x, y);
      if (doorBuilding) {
        audioDirector.unlock();
        audioDirector.playSfx("door_open");
        window.setTimeout(() => audioDirector.playSfx("camera_whoosh"), 120);
        const parts = campusRef.current.buildingParts.get(doorBuilding.id);
        if (parts) {
          spawnParticleBurst(
            campusRef.current.scene,
            parts.door.position.clone().add(parts.group.position),
            doorBuilding.accentColor,
            12,
          );
        }
        state.enterInterior(doorBuilding.id);
        return;
      }

      const building = campusRef.current.raycastBuilding(x, y);
      if (building) {
        audioDirector.unlock();
        audioDirector.playSfx("ui_open");
        const current = state.selectedBuilding;
        const next = current?.id === building.id ? null : building;
        state.selectBuilding(next);
      }
    };

    const onPointerUp = () => {
      const pan = interiorPanDragRef.current;
      if (pan) {
        if (!pan.moved && pan.pending) {
          resolveInteriorPendingAction(pan.pending);
        }
        interiorPanDragRef.current = null;
        canvas.style.cursor = "default";
      }

      const drag = dragFurnitureRef.current;
      const preview = dragPreviewRef.current;
      if (!drag || !preview || !interiorRef.current) {
        dragFurnitureRef.current = null;
        dragPreviewRef.current = null;
        interiorRef.current?.updateGhostPreview(null, null, null);
        return;
      }
      const state = useGameStore.getState();
      const buildingId = state.interiorBuildingId;
      if (!buildingId || state.buildMode !== "build") {
        dragFurnitureRef.current = null;
        dragPreviewRef.current = null;
        return;
      }
      const office = normalizeOfficeVisual(
        state.visualDesign.offices[buildingId] ?? DEFAULT_OFFICE_VISUAL,
        buildingId,
      );
      const next = moveFurniture(office, drag.furnitureId, preview);
      if (next) {
        patchOfficeVisual(buildingId, { furniture: next });
        audioDirector.playSfx("furniture_place");
        interiorSignatureRef.current = "";
      }
      dragFurnitureRef.current = null;
      dragPreviewRef.current = null;
      interiorRef.current.updateGhostPreview(null, null, null);
    };

    const applyInteriorWheelZoom = (deltaY: number) => {
      const state = useGameStore.getState();
      if (state.worldView !== "interior") {
        return;
      }
      const buildingId = state.interiorBuildingId;
      if (!buildingId) {
        return;
      }
      const office = normalizeOfficeVisual(
        state.visualDesign.offices[buildingId] ?? DEFAULT_OFFICE_VISUAL,
        buildingId,
      );
      if (!interiorOrbitRef.current) {
        interiorOrbitRef.current = createGameInteriorOrbit(office);
      }
      const step = deltaY > 0 ? -0.1 : 0.1;
      interiorOrbitRef.current.zoom = clampInteriorZoom(interiorOrbitRef.current.zoom + step);
      state.setCameraTransition(1);
    };

    const onWheel = (event: WheelEvent) => {
      const state = useGameStore.getState();
      if (state.worldView === "campus") {
        event.preventDefault();
        campusCameraRef.current.frustum = Math.max(
          8,
          Math.min(22, campusCameraRef.current.frustum + event.deltaY * 0.01),
        );
        return;
      }
      if (state.worldView === "interior") {
        event.preventDefault();
        applyInteriorWheelZoom(event.deltaY);
      }
    };

    const onWindowWheel = (event: WheelEvent) => {
      const state = useGameStore.getState();
      if (state.worldView !== "interior" || state.activePanel !== "office") {
        return;
      }
      event.preventDefault();
      applyInteriorWheelZoom(event.deltaY);
    };

    const onInteriorOrbitDown = (event: PointerEvent) => {
      const state = useGameStore.getState();
      if (state.worldView !== "interior" || event.button !== 2) {
        return;
      }
      interiorOrbitDragRef.current = { dragging: true, lastX: event.clientX, lastY: event.clientY };
      event.preventDefault();
    };

    const onInteriorOrbitMove = (event: PointerEvent) => {
      const drag = interiorOrbitDragRef.current;
      const orbit = interiorOrbitRef.current;
      if (!drag?.dragging || !orbit) {
        return;
      }
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      const state = useGameStore.getState();
      orbit.azimuth += dx * 0.008;
      if (state.interiorCameraMode === "walk") {
        orbit.elevation = Math.max(0.15, Math.min(0.55, orbit.elevation - dy * 0.005));
      } else if (state.interiorCameraMode === "render") {
        orbit.elevation = Math.max(0.25, Math.min(0.75, orbit.elevation - dy * 0.005));
      } else {
        orbit.elevation = Math.max(0.2, Math.min(0.95, orbit.elevation - dy * 0.006));
      }
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      useGameStore.getState().setCameraTransition(1);
    };

    const onInteriorOrbitUp = () => {
      const orbit = interiorOrbitRef.current;
      if (orbit) {
        orbit.azimuth = snapIsometricAzimuth(orbit.azimuth);
      }
      interiorOrbitDragRef.current = null;
    };

    const onCampusPanDown = (event: PointerEvent) => {
      const state = useGameStore.getState();
      if (state.worldView !== "campus" || event.button !== 2) {
        return;
      }
      campusPanRef.current = { dragging: true, lastX: event.clientX, lastY: event.clientY };
      event.preventDefault();
    };

    const onCampusPanMove = (event: PointerEvent) => {
      const pan = campusPanRef.current;
      if (!pan?.dragging) {
        return;
      }
      const dx = event.clientX - pan.lastX;
      const dy = event.clientY - pan.lastY;
      campusCameraRef.current.panX -= dx * 0.025;
      campusCameraRef.current.panZ -= dy * 0.025;
      pan.lastX = event.clientX;
      pan.lastY = event.clientY;
    };

    const onCampusPanUp = () => {
      campusPanRef.current = null;
    };

    const onDoubleClick = () => {
      const state = useGameStore.getState();
      if (state.worldView !== "interior") {
        return;
      }
      const buildingId = state.interiorBuildingId;
      if (!buildingId) {
        return;
      }
      const office = normalizeOfficeVisual(
        state.visualDesign.offices[buildingId] ?? DEFAULT_OFFICE_VISUAL,
        buildingId,
      );
      interiorOrbitRef.current = createInteriorOrbitForMode(office, state.interiorCameraMode);
      state.setCameraTransition(state.interiorCameraMode === "iso" ? 1 : 0);
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerdown", onInteriorOrbitDown);
    canvas.addEventListener("pointermove", onInteriorOrbitMove);
    canvas.addEventListener("pointerup", onInteriorOrbitUp);
    canvas.addEventListener("pointerdown", onCampusPanDown);
    canvas.addEventListener("pointermove", onCampusPanMove);
    canvas.addEventListener("pointerup", onCampusPanUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("wheel", onWindowWheel, { passive: false, capture: true });
    canvas.addEventListener("dblclick", onDoubleClick);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());

    const setWalkKey = (key: string, pressed: boolean) => {
      const state = useGameStore.getState();
      if (state.worldView !== "interior" || state.interiorCameraMode !== "walk") {
        return;
      }
      const keys = walkKeysRef.current;
      switch (key) {
        case "w":
        case "arrowup":
          keys.forward = pressed;
          break;
        case "s":
        case "arrowdown":
          keys.back = pressed;
          break;
        case "a":
        case "arrowleft":
          keys.left = pressed;
          break;
        case "d":
        case "arrowright":
          keys.right = pressed;
          break;
        default:
          break;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      setWalkKey(event.key.toLowerCase(), true);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      setWalkKey(event.key.toLowerCase(), false);
    };

    const onWindowBlur = () => {
      walkKeysRef.current = emptyWalkKeys();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    canvas.addEventListener("pointerleave", () => {
      useGameStore.getState().setHoveredDoorBuildingId(null);
      canvas.style.cursor = "default";
      campusPanRef.current = null;
      interiorOrbitDragRef.current = null;
      interiorPanDragRef.current = null;
    });

    return () => {
      disposed = true;
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerdown", onInteriorOrbitDown);
      canvas.removeEventListener("pointermove", onInteriorOrbitMove);
      canvas.removeEventListener("pointerup", onInteriorOrbitUp);
      canvas.removeEventListener("pointerdown", onCampusPanDown);
      canvas.removeEventListener("pointermove", onCampusPanMove);
      canvas.removeEventListener("pointerup", onCampusPanUp);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("wheel", onWindowWheel, { capture: true });
      canvas.removeEventListener("dblclick", onDoubleClick);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
      walkKeysRef.current = emptyWalkKeys();
      clearParticleBursts();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      labelsRef.current?.dispose();
      labelsRef.current = null;
      campusRef.current?.dispose();
      campusRef.current = null;
      interiorRef.current?.dispose();
      interiorRef.current = null;
    };
  }, []);

  useEffect(() => {
    campusRef.current?.resize(width, height);
    interiorRef.current?.resize(width, height);
    labelsRef.current?.resize(width, height);
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="game-canvas three-office-canvas"
      width={width}
      height={height}
      style={{ width, height, display: "block", touchAction: "none" }}
    />
  );
}