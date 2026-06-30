import { OrbitControls } from "@react-three/drei";
import { useGameStore } from "../../stores/gameStore";
import { AgentMesh } from "./AgentMesh";
import { BuildingMesh } from "./BuildingMesh";
import { CameraController } from "./CameraController";
import { OfficeTilemap } from "./OfficeTilemap";

export function IsometricWorld() {
  const agents = useGameStore((state) => state.agents);
  const buildings = useGameStore((state) => state.buildings);
  const selectBuilding = useGameStore((state) => state.selectBuilding);

  return (
    <>
      <color attach="background" args={["#87b8e8"]} />
      <ambientLight intensity={0.85} />
      <directionalLight intensity={1.15} position={[10, 16, 8]} />
      <hemisphereLight args={["#fff2d9", "#4f674c", 0.4]} />
      <CameraController />
      <OfficeTilemap />
      {buildings.map((building) => (
        <BuildingMesh
          key={building.id}
          building={building}
          onSelect={(value) => selectBuilding(value)}
        />
      ))}
      {agents.map((agent) => (
        <AgentMesh key={agent.id} agent={agent} />
      ))}
      <OrbitControls
        enablePan
        enableZoom
        target={[0, 0, 0]}
        maxPolarAngle={Math.PI / 2.15}
        minZoom={35}
        maxZoom={90}
      />
    </>
  );
}