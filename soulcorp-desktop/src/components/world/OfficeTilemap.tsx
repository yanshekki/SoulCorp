import { useMemo } from "react";

const TILE_SIZE = 1;
const MAP_WIDTH = 24;
const MAP_HEIGHT = 18;

export function OfficeTilemap() {
  const tiles = useMemo(() => {
    const items: { x: number; z: number; tone: string }[] = [];
    for (let x = -MAP_WIDTH / 2; x < MAP_WIDTH / 2; x += 1) {
      for (let z = -MAP_HEIGHT / 2; z < MAP_HEIGHT / 2; z += 1) {
        const checker = (x + z) % 2 === 0;
        items.push({
          x: x * TILE_SIZE,
          z: z * TILE_SIZE,
          tone: checker ? "#6f8f6b" : "#5d7d59",
        });
      }
    }
    return items;
  }, []);

  return (
    <group>
      {tiles.map((tile) => (
        <mesh
          key={`${tile.x}-${tile.z}`}
          position={[tile.x, 0, tile.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
          <meshStandardMaterial color={tile.tone} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[MAP_WIDTH + 4, MAP_HEIGHT + 4]} />
        <meshStandardMaterial color="#4f674c" />
      </mesh>
    </group>
  );
}