import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useContainerSize } from "../../hooks/useContainerSize";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import { DEFAULT_OFFICE_VISUAL } from "../../types/visualDesign";
import type { Building } from "../../types/world";
import {
  applyInteriorPan,
  applyOrbitToCamera,
  clampInteriorZoom,
  createGameInteriorOrbit,
  interiorFrustumForOrbit,
  interiorSceneFocusZ,
  snapIsometricAzimuth,
  type InteriorOrbitState,
} from "../../utils/interiorCamera";
import { withPreviewDecor } from "../../utils/previewOfficeDecor";
import { INTERIOR_LAYOUT_VERSION } from "../../utils/interiorScale";
import { normalizeOfficeVisual } from "../../utils/officeVisualNormalize";
import { createInteriorScene, type InteriorSceneHandles } from "../world/interiorScene";

const DRAG_THRESHOLD_PX = 6;

interface InteriorDesignViewportProps {
  compact?: boolean;
}

interface PanDragState {
  dragging: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

function fallbackBuilding(buildingId: string, buildings: Building[]): Building {
  return (
    buildings.find((entry) => entry.id === buildingId) ?? {
      id: buildingId,
      name: buildingId.toUpperCase(),
      department: "general",
      description: "",
      color: "#6d7f9b",
      roofColor: "#4a6fa5",
      accentColor: "#5ec8ff",
      size: [3.8, 2.8, 3.4],
      position: [0, 0, 0],
    }
  );
}

function furnitureIdForObject(object: THREE.Object3D): string | null {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (node.userData.furnitureId) {
      return node.userData.furnitureId as string;
    }
    node = node.parent;
  }
  return null;
}

function applySelectionHighlight(root: THREE.Group, selectedId: string | null): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const mat = child.material;
    if (!(mat instanceof THREE.MeshStandardMaterial)) {
      return;
    }
    const furnitureId = furnitureIdForObject(child);
    if (furnitureId && furnitureId === selectedId) {
      mat.emissive.set("#5ec8ff");
      mat.emissiveIntensity = 0.35;
      child.userData._studioHighlight = true;
    } else if (child.userData._studioHighlight) {
      mat.emissive.set("#000000");
      mat.emissiveIntensity = 0;
      delete child.userData._studioHighlight;
    }
  });
}

export function InteriorDesignViewport({ compact = false }: InteriorDesignViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<InteriorSceneHandles | null>(null);
  const orbitRef = useRef<InteriorOrbitState>(createGameInteriorOrbit(DEFAULT_OFFICE_VISUAL));
  const panDragRef = useRef<PanDragState | null>(null);
  const orbitDragRef = useRef<{ dragging: boolean; lastX: number; lastY: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef(performance.now());
  const lastRebuildSignatureRef = useRef("");
  const viewSizeRef = useRef({ width: 0, height: 0 });
  const [sceneLoading, setSceneLoading] = useState(false);

  const size = useContainerSize(containerRef);
  viewSizeRef.current = size;
  const buildings = useGameStore((state) => state.buildings);
  const companyName = useGameStore((state) => state.companyName);
  const agents = useGameStore((state) => state.agents);
  const pixelFilter = useGameStore((state) => state.settings.pixel_filter_enabled);
  const lowPowerMode = useGameStore((state) => state.settings.low_power_mode);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const draft = useDesignStudioStore((state) => state.draft);
  const selectedBuildingId = useDesignStudioStore((state) => state.selectedBuildingId);
  const selectedFurnitureId = useDesignStudioStore((state) => state.selectedFurnitureId);
  const activeZone = useDesignStudioStore((state) => state.activeZone);

  const buildingId = selectedBuildingId ?? buildings[0]?.id ?? "hq";
  const buildingName =
    buildings.find((entry) => entry.id === buildingId)?.name ?? buildingId.toUpperCase();
  const office = useMemo(
    () => normalizeOfficeVisual(draft.offices[buildingId] ?? DEFAULT_OFFICE_VISUAL, buildingId),
    [draft.offices, buildingId],
  );
  const previewOffice = useMemo(
    () => withPreviewDecor(office, buildingId),
    [buildingId, office],
  );
  const signature = useMemo(
    () =>
      JSON.stringify({
        layout: INTERIOR_LAYOUT_VERSION,
        buildingId,
        office: previewOffice,
        pixel: pixelFilter,
        cozy: !lowPowerMode,
      }),
    [buildingId, lowPowerMode, pixelFilter, previewOffice],
  );
  const previewAgents = useMemo(() => agents.slice(0, 3), [agents]);
  const officeZ = useMemo(() => interiorSceneFocusZ(), []);

  useEffect(() => {
    orbitRef.current = createGameInteriorOrbit(previewOffice);
  }, [previewOffice]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || sceneRef.current) {
      return;
    }
    const { width: initWidth, height: initHeight } = viewSizeRef.current;
    if (initWidth < 80 || initHeight < 80) {
      return;
    }

    lastRebuildSignatureRef.current = "";
    sceneRef.current = createInteriorScene(canvas, initWidth, initHeight);

    const renderLoop = (now: number) => {
      const handles = sceneRef.current;
      const orbit = orbitRef.current;
      if (handles) {
        const { width: viewWidth, height: viewHeight } = viewSizeRef.current;
        const delta = Math.min((now - lastFrameRef.current) / 1000, 0.05);
        lastFrameRef.current = now;
        handles.tick(delta, previewAgents);
        applyOrbitToCamera(handles.camera, orbit, officeZ);
        handles.syncCamera(
          previewOffice,
          viewWidth,
          viewHeight,
          interiorFrustumForOrbit(previewOffice, orbit),
        );
        handles.renderFrame();
      }
      frameRef.current = requestAnimationFrame(renderLoop);
    };
    frameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [officeZ, previewAgents, previewOffice, size.height, size.width]);

  useEffect(() => {
    const handles = sceneRef.current;
    if (!handles) {
      return;
    }
    handles.syncCamera(
      previewOffice,
      size.width,
      size.height,
      interiorFrustumForOrbit(previewOffice, orbitRef.current),
    );
    handles.resize(size.width, size.height);
  }, [previewOffice, size.height, size.width]);

  useEffect(() => {
    const handles = sceneRef.current;
    if (!handles || signature === lastRebuildSignatureRef.current) {
      return;
    }
    lastRebuildSignatureRef.current = signature;
    handles.setVisualStyle({
      pixelAgents: pixelFilter,
      cozyEffects: false,
      clarityMode: true,
    });
    const building = fallbackBuilding(buildingId, buildings);
    setSceneLoading(true);
    void handles
      .rebuild(building, previewOffice, previewAgents, agentRecords, companyName)
      .finally(() => setSceneLoading(false));
  }, [
    agentRecords,
    buildingId,
    buildings,
    companyName,
    lowPowerMode,
    pixelFilter,
    previewAgents,
    previewOffice,
    signature,
  ]);

  useEffect(() => {
    const handles = sceneRef.current;
    if (!handles) {
      return;
    }
    applySelectionHighlight(handles.root, selectedFurnitureId);
  }, [selectedFurnitureId, signature]);

  useEffect(() => {
    sceneRef.current?.setFocusZone(activeZone);
  }, [activeZone, signature]);

  const applyPanDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pan = panDragRef.current;
    const orbit = orbitRef.current;
    if (!pan?.dragging) {
      return;
    }
    const totalDx = event.clientX - pan.startX;
    const totalDy = event.clientY - pan.startY;
    if (
      !pan.moved &&
      (Math.abs(totalDx) > DRAG_THRESHOLD_PX || Math.abs(totalDy) > DRAG_THRESHOLD_PX)
    ) {
      pan.moved = true;
    }
    if (!pan.moved) {
      return;
    }
    const dx = event.clientX - pan.lastX;
    const dy = event.clientY - pan.lastY;
    pan.lastX = event.clientX;
    pan.lastY = event.clientY;
    const frustum = interiorFrustumForOrbit(previewOffice, orbit);
    applyInteriorPan(orbit, dx, dy, size.width, frustum);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button === 2) {
      orbitDragRef.current = { dragging: true, lastX: event.clientX, lastY: event.clientY };
      event.preventDefault();
      return;
    }
    if (event.button !== 0) {
      return;
    }
    panDragRef.current = {
      dragging: true,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const orbitDrag = orbitDragRef.current;
    if (orbitDrag?.dragging) {
      const dx = event.clientX - orbitDrag.lastX;
      const dy = event.clientY - orbitDrag.lastY;
      orbitRef.current.azimuth += dx * 0.008;
      orbitRef.current.elevation = Math.max(
        0.2,
        Math.min(0.95, orbitRef.current.elevation - dy * 0.006),
      );
      orbitDrag.lastX = event.clientX;
      orbitDrag.lastY = event.clientY;
      return;
    }
    applyPanDrag(event);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    panDragRef.current = null;
    if (orbitDragRef.current) {
      orbitRef.current.azimuth = snapIsometricAzimuth(orbitRef.current.azimuth);
      orbitDragRef.current = null;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const step = event.deltaY > 0 ? -0.07 : 0.07;
    orbitRef.current.zoom = clampInteriorZoom(orbitRef.current.zoom + step);
  };

  const onDoubleClick = () => {
    orbitRef.current = createGameInteriorOrbit(previewOffice);
  };

  return (
    <section
      className={`design-interior-viewport${compact ? " design-interior-viewport--compact" : ""}`}
      ref={containerRef}
    >
      {compact ? null : (
        <header className="design-interior-viewport-header">
          <div>
            <h2>{buildingName} — 3D 預覽</h2>
            <p className="muted">跟平面圖即時同步 · 拖曳平移 · 滾輪縮放 · 右鍵旋轉</p>
          </div>
        </header>
      )}
      <div
        className={`design-interior-canvas-wrap${pixelFilter ? " design-interior-canvas-wrap--pixel" : ""}`}
      >
        <canvas
          ref={canvasRef}
          className="design-interior-canvas"
          width={size.width}
          height={size.height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
          onDoubleClick={onDoubleClick}
          onContextMenu={(event) => event.preventDefault()}
        />
        {sceneLoading ? <p className="design-interior-loading">Loading furniture…</p> : null}
      </div>
    </section>
  );
}