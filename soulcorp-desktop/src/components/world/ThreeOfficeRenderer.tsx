import { useEffect, useRef } from "react";
import { useGameStore } from "../../stores/gameStore";
import {
  createOfficeScene,
  renderScene,
  syncSceneAgents,
  syncSceneBuildings,
  updateCamera,
  type OfficeSceneHandles,
} from "./threeOfficeScene";

interface ThreeOfficeRendererProps {
  width: number;
  height: number;
}

export function ThreeOfficeRenderer({ width, height }: ThreeOfficeRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handlesRef = useRef<OfficeSceneHandles | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef(performance.now());
  const selectBuilding = useGameStore((state) => state.selectBuilding);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width < 80 || height < 80) {
      return;
    }

    let disposed = false;
    try {
      handlesRef.current = createOfficeScene(canvas, width, height);
    } catch {
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
      syncSceneAgents(handlesRef.current, state.agents);
      updateCamera(handlesRef.current.camera, state.selectedBuilding, delta);
      renderScene(handlesRef.current);

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
        selectBuilding(current?.id === building.id ? null : building);
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
  }, [height, selectBuilding, width]);

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