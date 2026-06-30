import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useGameStore } from "../../stores/gameStore";
import { AgentSprite } from "../AgentSprite";
import { BuildingMesh } from "./BuildingMesh";
import { OfficeTilemap } from "./OfficeTilemap";

const ISO_OFFSET = new THREE.Vector3(12, 12, 12);
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);

export function IsometricWorld() {
  const lowPowerMode = useGameStore((state) => state.settings.low_power_mode);
  const agents = useGameStore((state) => state.agents);
  const buildings = useGameStore((state) => state.buildings);
  const selectedBuilding = useGameStore((state) => state.selectedBuilding);
  const selectBuilding = useGameStore((state) => state.selectBuilding);
  const cameraRef = useRef<THREE.OrthographicCamera>(null);
  const controlsRef = useRef<any>(null);
  const { size } = useThree();

  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;

    const aspect = size.width / size.height;
    const frustum = 10;
    camera.left = (-frustum * aspect) / 2;
    camera.right = (frustum * aspect) / 2;
    camera.top = frustum / 2;
    camera.bottom = -frustum / 2;
    camera.updateProjectionMatrix();
  }, [size]);

  useFrame((_, delta) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    if (selectedBuilding) {
      const [x, , z] = selectedBuilding.position;
      const zoomTarget = new THREE.Vector3(x, 1.5, z);
      const zoomPosition = new THREE.Vector3(x, 8, z + 7);
      camera.position.lerp(zoomPosition, delta * 2.5);
      controls.target.lerp(zoomTarget, delta * 2.5);
      controls.update();
      return;
    }

    const defaultPosition = DEFAULT_TARGET.clone().add(ISO_OFFSET);
    camera.position.lerp(defaultPosition, delta * 2);
    controls.target.lerp(DEFAULT_TARGET, delta * 2);
    controls.update();
  });

  return (
    <>
      <color attach="background" args={["#87b8e8"]} />
      <fog attach="fog" args={["#b9d8f6", lowPowerMode ? 18 : 24, lowPowerMode ? 36 : 48]} />
      <OrthographicCamera
        ref={cameraRef}
        makeDefault
        position={ISO_OFFSET.toArray()}
        near={0.1}
        far={200}
        zoom={45}
      />
      <ambientLight intensity={0.65} />
      <directionalLight
        castShadow={!lowPowerMode}
        intensity={lowPowerMode ? 0.85 : 1.1}
        position={[8, 14, 6]}
        shadow-mapSize-width={lowPowerMode ? 512 : 1024}
        shadow-mapSize-height={lowPowerMode ? 512 : 1024}
      />
      <hemisphereLight args={["#fff2d9", "#4f674c", 0.35]} />
      <OfficeTilemap />
      {buildings.map((building) => (
        <BuildingMesh
          key={building.id}
          building={building}
          onSelect={(value) => selectBuilding(value)}
        />
      ))}
      <AgentSprite agents={agents} />
      <OrbitControls
        ref={controlsRef}
        enablePan
        enableZoom
        maxPolarAngle={Math.PI / 2.2}
        minZoom={30}
        maxZoom={90}
      />
    </>
  );
}