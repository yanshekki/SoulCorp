import { Canvas } from "@react-three/fiber";
import { useRef, useState, type RefObject } from "react";
import { useContainerSize } from "../hooks/useContainerSize";
import { useGameStore } from "../stores/gameStore";
import { IsometricWorld } from "./world/IsometricWorld";
import { OfficeMapFallback } from "./world/OfficeMapFallback";

export function GameScene() {
  const containerRef = useRef<HTMLElement>(null);
  const size = useContainerSize(containerRef);
  const pixelFilter = useGameStore((state) => state.settings.pixel_filter_enabled);
  const [webglFailed, setWebglFailed] = useState(false);

  const ready = size.width > 80 && size.height > 80;

  return (
    <section
      ref={containerRef}
      className={`game-scene ${pixelFilter ? "pixel-filter" : ""}`}
      aria-label="Isometric office world"
    >
      {webglFailed || !ready ? (
        <OfficeMapFallback />
      ) : (
        <>
          <Canvas
            orthographic
            camera={{ position: [14, 14, 14], zoom: 50, near: 0.1, far: 500 }}
            className="game-canvas"
            style={{ width: size.width, height: size.height }}
            eventSource={containerRef as RefObject<HTMLElement>}
            resize={{ scroll: false, debounce: { resize: 0, scroll: 0 } }}
            dpr={[1, Math.min(window.devicePixelRatio, 2)]}
            gl={{
              antialias: false,
              alpha: false,
              powerPreference: "default",
              failIfMajorPerformanceCaveat: false,
            }}
            frameloop="always"
            onCreated={({ gl }) => {
              gl.setClearColor("#87b8e8");
              gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            }}
            onError={() => setWebglFailed(true)}
          >
            <IsometricWorld />
          </Canvas>
        </>
      )}
      <div className="scene-hint">
        {webglFailed
          ? "3D renderer unavailable. Showing 2D fallback map."
          : "3D office world. Agents commute to desks, meetings, and breaks with purpose."}
      </div>
    </section>
  );
}