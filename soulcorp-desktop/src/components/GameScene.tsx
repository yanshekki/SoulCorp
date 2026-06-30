import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import { useContainerSize } from "../hooks/useContainerSize";
import { useGameStore } from "../stores/gameStore";
import { OfficeMapFallback } from "./world/OfficeMapFallback";
import { IsometricWorld } from "./world/IsometricWorld";

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function GameScene() {
  const containerRef = useRef<HTMLElement>(null);
  const size = useContainerSize(containerRef);
  const pixelFilter = useGameStore((state) => state.settings.pixel_filter_enabled);
  const lowPowerMode = useGameStore((state) => state.settings.low_power_mode);
  const [webglSupported] = useState(detectWebGL);
  const [webglFailed, setWebglFailed] = useState(false);
  const [preferWebgl, setPreferWebgl] = useState(false);

  useEffect(() => {
    if (!preferWebgl || webglFailed || size.width < 80 || size.height < 80) {
      return;
    }

    const timer = window.setTimeout(() => {
      const canvas = containerRef.current?.querySelector("canvas");
      if (!canvas || canvas.clientWidth < 80 || canvas.clientHeight < 80) {
        setWebglFailed(true);
        setPreferWebgl(false);
      }
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [preferWebgl, webglFailed, size.width, size.height]);

  const useFallback = !preferWebgl || webglFailed || !webglSupported;

  return (
    <section
      ref={containerRef}
      className={`game-scene ${pixelFilter ? "pixel-filter" : ""}`}
      aria-label="Isometric office world"
    >
      {useFallback ? (
        <OfficeMapFallback />
      ) : size.width > 0 && size.height > 0 ? (
        <Suspense fallback={<OfficeMapFallback />}>
          <Canvas
            shadows={!lowPowerMode}
            dpr={lowPowerMode ? 1 : Math.min(window.devicePixelRatio, 2)}
            className="game-canvas"
            resize={{ scroll: false, offsetSize: true }}
            style={{ width: size.width, height: size.height }}
            gl={{
              antialias: false,
              alpha: false,
              powerPreference: "default",
              failIfMajorPerformanceCaveat: false,
              preserveDrawingBuffer: true,
            }}
            frameloop="always"
            onCreated={({ gl }) => {
              gl.setClearColor("#87b8e8");
              gl.domElement.style.width = `${size.width}px`;
              gl.domElement.style.height = `${size.height}px`;
            }}
            onError={() => setWebglFailed(true)}
          >
            <IsometricWorld />
          </Canvas>
        </Suspense>
      ) : (
        <OfficeMapFallback />
      )}
      <div className="scene-hint">
        {useFallback
          ? "2D office map active. Click buildings to inspect departments."
          : "Click a building to zoom into its department."}
        {webglSupported && useFallback ? (
          <button
            type="button"
            className="scene-hint-action"
            onClick={() => {
              setWebglFailed(false);
              setPreferWebgl(true);
            }}
          >
            Try 3D view
          </button>
        ) : null}
        {webglSupported && preferWebgl && !useFallback ? (
          <button
            type="button"
            className="scene-hint-action"
            onClick={() => setPreferWebgl(false)}
          >
            Use 2D map
          </button>
        ) : null}
      </div>
    </section>
  );
}