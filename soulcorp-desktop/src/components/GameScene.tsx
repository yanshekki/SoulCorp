import { useRef } from "react";
import { useContainerSize } from "../hooks/useContainerSize";
import { useGameStore } from "../stores/gameStore";
import { OfficeMapFallback } from "./world/OfficeMapFallback";
import { ThreeOfficeRenderer } from "./world/ThreeOfficeRenderer";

export function GameScene() {
  const containerRef = useRef<HTMLElement>(null);
  const size = useContainerSize(containerRef);
  const pixelFilter = useGameStore((state) => state.settings.pixel_filter_enabled);

  const ready = size.width > 80 && size.height > 80;

  return (
    <section
      ref={containerRef}
      className={`game-scene ${pixelFilter ? "pixel-filter" : ""}`}
      aria-label="Isometric office world"
    >
      <div className="game-scene-sky" aria-hidden />
      {ready ? (
        <ThreeOfficeRenderer width={size.width} height={size.height} />
      ) : (
        <OfficeMapFallback />
      )}
      <div className="scene-hint">
        3D office campus — click buildings to inspect departments.
      </div>
    </section>
  );
}