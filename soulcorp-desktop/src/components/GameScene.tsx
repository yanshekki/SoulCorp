import { Canvas } from "@react-three/fiber";
import { IsometricWorld } from "./world/IsometricWorld";

export function GameScene() {
  return (
    <section className="game-scene" aria-label="Isometric office world">
      <Canvas shadows className="game-canvas">
        <IsometricWorld />
      </Canvas>
      <div className="scene-hint">Click a building to zoom into its department.</div>
    </section>
  );
}