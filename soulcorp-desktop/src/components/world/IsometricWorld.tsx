import { OrbitControls } from "@react-three/drei";
import { useGameStore } from "../../stores/gameStore";
import { BuildingMesh } from "./BuildingMesh";
import { CameraController } from "./CameraController";
import { HumanoidCharacter } from "./HumanoidCharacter";
import { OfficeEnvironment } from "./OfficeEnvironment";
import { OfficeTilemap } from "./OfficeTilemap";

export function IsometricWorld() {
  const agents = useGameStore((state) => state.agents);
  const buildings = useGameStore((state) => state.buildings);
  const lowPowerMode = useGameStore((state) => state.settings.low_power_mode);
  const selectBuilding = useGameStore((state) => state.selectBuilding);

  return (
    <>
      <color attach="background" args={["#8ec8ef"]} />
      <fog attach="fog" args={["#b7daf5", 22, 58]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#fff5df", "#567552", 0.45]} />
      <directionalLight
        castShadow={!lowPowerMode}
        intensity={1.35}
        position={[12, 20, 8]}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />
      <CameraController />
      <OfficeTilemap />
      <OfficeEnvironment />
      {buildings.map((building) => (
        <BuildingMesh
          key={building.id}
          building={building}
          onSelect={(value) => selectBuilding(value)}
        />
      ))}
      {agents.map((agent) => (
        <HumanoidCharacter key={agent.id} agent={agent} />
      ))}
      <OrbitControls
        enablePan
        enableZoom
        target={[0, 0, 0]}
        maxPolarAngle={Math.PI / 2.12}
        minZoom={38}
        maxZoom={95}
      />
    </>
  );
}