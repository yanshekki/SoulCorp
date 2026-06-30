import { useMemo } from "react";
import * as THREE from "three";

const MAP_WIDTH = 24;
const MAP_HEIGHT = 18;

function createCheckerTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.Texture();
  }

  const tile = canvas.width / 2;
  ctx.fillStyle = "#6f8f6b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#5d7d59";
  ctx.fillRect(0, 0, tile, tile);
  ctx.fillRect(tile, tile, tile, tile);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(MAP_WIDTH / 2, MAP_HEIGHT / 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export function OfficeTilemap() {
  const groundTexture = useMemo(() => createCheckerTexture(), []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[MAP_WIDTH, MAP_HEIGHT]} />
        <meshStandardMaterial map={groundTexture} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[MAP_WIDTH + 4, MAP_HEIGHT + 4]} />
        <meshStandardMaterial color="#4f674c" />
      </mesh>
    </group>
  );
}