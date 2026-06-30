import type { ThreeEvent } from "@react-three/fiber";
import type { Building } from "../../types/world";

interface BuildingMeshProps {
  building: Building;
  onSelect: (building: Building) => void;
}

export function BuildingMesh({ building, onSelect }: BuildingMeshProps) {
  const [width, height, depth] = building.size;
  const [x, , z] = building.position;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(building);
  };

  return (
    <group position={[x, height / 2, z]} onClick={handleClick}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={building.color} />
      </mesh>
      <mesh position={[0, height / 2 + 0.2, 0]} castShadow>
        <boxGeometry args={[width * 0.9, 0.4, depth * 0.9]} />
        <meshStandardMaterial color={building.roofColor} />
      </mesh>
    </group>
  );
}