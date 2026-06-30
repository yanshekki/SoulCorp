import * as THREE from "three";
import type { Building } from "../../types/world";

const textureCache = new Map<string, THREE.CanvasTexture>();

export function getPixelBuildingTexture(building: Building): THREE.CanvasTexture {
  const key = `${building.id}:${building.color}:${building.roofColor}`;
  const cached = textureCache.get(key);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const tile = 8;
    for (let y = 0; y < 64; y += tile) {
      for (let x = 0; x < 64; x += tile) {
        const wall = (x + y) % 16 === 0 ? darken(building.color, 0.08) : building.color;
        ctx.fillStyle = y < 16 ? building.roofColor : wall;
        ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      }
    }
    ctx.fillStyle = building.accentColor;
    ctx.fillRect(20, 44, 24, 6);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.2, 1.4);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

function darken(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  color.offsetHSL(0, 0, -amount);
  return `#${color.getHexString()}`;
}