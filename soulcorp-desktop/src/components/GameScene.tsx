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
        style={{ width: "100%", height: "100%" }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor("#87b8e8");
        }}
      >
        <IsometricWorld />
      </Canvas>
      <div className="scene-hint">Click a building to zoom into its department.</div>
    </section>
  );
}