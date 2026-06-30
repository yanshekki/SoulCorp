import { useMemo } from "react";
import * as THREE from "three";

const MAP_WIDTH = 28;
const MAP_HEIGHT = 22;

function createGroundTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.Texture();
  }

  ctx.fillStyle = "#6f9a67";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const tile = 16;
  for (let y = 0; y < canvas.height; y += tile) {
    for (let x = 0; x < canvas.width; x += tile) {
      const shade = (x + y) % (tile * 2) === 0 ? "#5f8a57" : "#79a86f";
      ctx.fillStyle = shade;
      ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 8);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

export function OfficeTilemap() {
  const groundTexture = useMemo(() => createGroundTexture(), []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[MAP_WIDTH, MAP_HEIGHT]} />
        <meshStandardMaterial map={groundTexture} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
        <planeGeometry args={[MAP_WIDTH + 6, MAP_HEIGHT + 6]} />
        <meshStandardMaterial color="#4d6d47" />
      </mesh>
    </group>
  );
}