import { useEffect, useRef } from "react";
import { run3dSmokeTestFromCanvas } from "../../services/scene3dSmoke";
import { useGameStore } from "../../stores/gameStore";
import {
  createOfficeScene,
  renderScene,
  syncSceneAgents,
  syncSceneBuildings,
  updateCamera,
  type OfficeSceneHandles,
} from "./threeOfficeScene";

export type RenderStatus = "initializing" | "ready" | "failed";

interface ThreeOfficeRendererProps {
  width: number;
  height: number;
  onStatusChange: (status: RenderStatus, error?: string) => void;
}

export function ThreeOfficeRenderer({
  width,
  height,
  onStatusChange,
}: ThreeOfficeRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handlesRef = useRef<OfficeSceneHandles | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef(performance.now());
  const onStatusChangeRef = useRef(onStatusChange);
  const smokeFramesRef = useRef(0);
  const smokeDoneRef = useRef(false);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width < 80 || height < 80) {
      return;
    }

    let disposed = false;
    onStatusChangeRef.current("initializing");

    try {
      handlesRef.current = createOfficeScene(canvas, width, height);
      onStatusChangeRef.current("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onStatusChangeRef.current("failed", message);
      return;
    }

    const loop = (time: number) => {
      if (disposed || !handlesRef.current) {
        return;
      }
      const delta = Math.min((time - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = time;

      const state = useGameStore.getState();
      syncSceneBuildings(handlesRef.current, state.buildings);
      syncSceneAgents(handlesRef.current, state.agents, state.settings.low_power_mode);
      updateCamera(handlesRef.current.camera, state.selectedBuilding, delta);
      renderScene(handlesRef.current);

      if (!smokeDoneRef.current) {
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

    const onPointerDown = (event: PointerEvent) => {
      if (!handlesRef.current) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const building = handlesRef.current.raycastBuilding(x, y);
      if (building) {
        const current = useGameStore.getState().selectedBuilding;
        const next = current?.id === building.id ? null : building;
        useGameStore.getState().selectBuilding(next);
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);

    return () => {
      disposed = true;
      canvas.removeEventListener("pointerdown", onPointerDown);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      handlesRef.current?.dispose();
      handlesRef.current = null;
    };
  }, [height, width]);

  useEffect(() => {
    handlesRef.current?.resize(width, height);
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