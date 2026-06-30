import { Canvas } from "@react-three/fiber";
import { useGameStore } from "../stores/gameStore";
import { IsometricWorld } from "./world/IsometricWorld";

export function GameScene() {
  const pixelFilter = useGameStore((state) => state.settings.pixel_filter_enabled);
  const lowPowerMode = useGameStore((state) => state.settings.low_power_mode);

  return (
    <section
      className={`game-scene ${pixelFilter ? "pixel-filter" : ""}`}
      aria-label="Isometric office world"
    >
      <Canvas
        shadows={!lowPowerMode}
        dpr={lowPowerMode ? 1 : Math.min(window.devicePixelRatio, 2)}
        className="game-canvas"
      >
        <IsometricWorld />
      </Canvas>
      <div className="scene-hint">Click a building to zoom into its department.</div>
    </section>
  );
}