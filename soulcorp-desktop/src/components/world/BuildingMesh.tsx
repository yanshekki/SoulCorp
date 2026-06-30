import type { ThreeEvent } from "@react-three/fiber";
import type { Building } from "../../types/world";

interface BuildingMeshProps {
  building: Building;
  onSelect: (building: Building) => void;
}

function WindowGrid({
  width,
  height,
  depth,
}: {
  width: number;
  height: number;
  depth: number;
}) {
  const rows = 2;
  const cols = 2;
  const windows = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = (col - (cols - 1) / 2) * (width * 0.28);
      const y = height * 0.1 + row * (height * 0.22);
      windows.push(
        <mesh key={`${row}-${col}`} position={[x, y, depth / 2 + 0.03]}>
          <boxGeometry args={[width * 0.18, height * 0.16, 0.05]} />
          <meshStandardMaterial color="#d8ecff" emissive="#9fd0ff" emissiveIntensity={0.15} />
        </mesh>,
      );
    }
  }

  return <group>{windows}</group>;
}

export function BuildingMesh({ building, onSelect }: BuildingMeshProps) {
  const [width, height, depth] = building.size;
  const [x, , z] = building.position;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(building);
  };

  return (
    <group position={[x, 0, z]} onClick={handleClick}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={building.color} />
      </mesh>
      <mesh position={[0, height + 0.12, 0]} castShadow>
        <boxGeometry args={[width * 0.92, 0.35, depth * 0.92]} />
        <meshStandardMaterial color={building.roofColor} />
      </mesh>
      <mesh position={[0, height * 0.55, depth / 2 + 0.04]} castShadow>
        <boxGeometry args={[width * 0.28, height * 0.42, 0.08]} />
        <meshStandardMaterial color="#4a3428" />
      </mesh>
      <mesh position={[0, height + 0.55, -depth * 0.18]} castShadow>
        <boxGeometry args={[0.35, 0.55, 0.35]} />
        <meshStandardMaterial color={building.accentColor} />
      </mesh>
      <group position={[0, height / 2, 0]}>
        <WindowGrid width={width} height={height} depth={depth} />
      </group>
      <mesh position={[0, height + 0.95, 0]}>
        <boxGeometry args={[width * 0.75, 0.18, 0.08]} />
        <meshStandardMaterial color={building.accentColor} />
      </mesh>
    </group>
  );
}