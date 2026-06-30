import { useMemo } from "react";
import * as THREE from "three";

interface NameSpriteProps {
  name: string;
  status: string;
}

function createLabelTexture(name: string, status: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.Texture();
  }

  ctx.fillStyle = "rgba(18, 14, 12, 0.9)";
  ctx.beginPath();
  ctx.roundRect(8, 8, 304, 80, 18);
  ctx.fill();

  ctx.fillStyle = "#fff8ef";
  ctx.font = "bold 26px Segoe UI, sans-serif";
  ctx.fillText(name, 20, 40);

  ctx.fillStyle = "#d9c8b4";
  ctx.font = "18px Segoe UI, sans-serif";
  ctx.fillText(status, 20, 68);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function NameSprite({ name, status }: NameSpriteProps) {
  const texture = useMemo(() => createLabelTexture(name, status), [name, status]);

  return (
    <sprite position={[0, 2.35, 0]} scale={[2.4, 0.72, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}