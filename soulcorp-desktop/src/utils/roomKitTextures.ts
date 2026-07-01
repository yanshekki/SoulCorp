import * as THREE from "three";
import { getOfficeThemePack, type OfficeThemePack } from "../data/officeThemePacks";
import type { InteriorZone, OfficeVisualConfig } from "../types/visualDesign";
import { floorTextureRepeat } from "./interiorScale";

export type FloorKitStyle = "oak_plank" | "corporate_tile" | "clinical_tile";

const TEXTURE_SIZE = 128;
const PLANKS_PER_METER = 4;

function adjustHex(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + amount / 100, 0, 1));
  return `#${color.getHexString()}`;
}

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function floorKitStyle(pack: OfficeThemePack): FloorKitStyle {
  switch (pack.id) {
    case "corporate_cool":
      return "corporate_tile";
    case "clinical_playful":
      return "clinical_tile";
    default:
      return "oak_plank";
  }
}

function paintOakPlanks(ctx: CanvasRenderingContext2D, baseColor: string, zone: InteriorZone): void {
  const plankH = TEXTURE_SIZE / PLANKS_PER_METER;
  for (let row = 0; row < PLANKS_PER_METER; row += 1) {
    const y = row * plankH;
    const variation = (hash(row, zone.charCodeAt(0)) - 0.5) * 0.08;
    const plankColor = adjustHex(baseColor, variation * 100);
    ctx.fillStyle = plankColor;
    ctx.fillRect(0, y + 1, TEXTURE_SIZE, plankH - 2);
    ctx.strokeStyle = adjustHex(baseColor, -18);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TEXTURE_SIZE, y);
    ctx.stroke();
    const seamX = Math.floor(hash(row, 7) * (TEXTURE_SIZE * 0.6) + TEXTURE_SIZE * 0.2);
    ctx.strokeStyle = adjustHex(baseColor, -10);
    ctx.beginPath();
    ctx.moveTo(seamX, y + 1);
    ctx.lineTo(seamX, y + plankH - 1);
    ctx.stroke();
  }
  if (zone === "lobby") {
    ctx.fillStyle = adjustHex(baseColor, 6);
    ctx.globalAlpha = 0.15;
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    ctx.globalAlpha = 1;
  }
}

function paintCorporateTile(ctx: CanvasRenderingContext2D, baseColor: string): void {
  const tile = TEXTURE_SIZE / 2;
  for (let y = 0; y < 2; y += 1) {
    for (let x = 0; x < 2; x += 1) {
      const alt = (x + y) % 2 === 0;
      ctx.fillStyle = alt ? baseColor : adjustHex(baseColor, alt ? 4 : -5);
      ctx.fillRect(x * tile + 2, y * tile + 2, tile - 4, tile - 4);
    }
  }
  ctx.strokeStyle = adjustHex(baseColor, -14);
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, TEXTURE_SIZE - 2, TEXTURE_SIZE - 2);
  ctx.beginPath();
  ctx.moveTo(tile, 0);
  ctx.lineTo(tile, TEXTURE_SIZE);
  ctx.moveTo(0, tile);
  ctx.lineTo(TEXTURE_SIZE, tile);
  ctx.stroke();
}

function paintClinicalTile(ctx: CanvasRenderingContext2D, baseColor: string, accent: string): void {
  const tile = TEXTURE_SIZE / 4;
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const n = hash(x, y) * 0.06;
      ctx.fillStyle = adjustHex(baseColor, (n - 0.03) * 100);
      ctx.fillRect(x * tile + 1, y * tile + 1, tile - 2, tile - 2);
    }
  }
  ctx.strokeStyle = adjustHex(accent, -5);
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const p = i * tile;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, TEXTURE_SIZE);
    ctx.moveTo(0, p);
    ctx.lineTo(TEXTURE_SIZE, p);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function createRoomFloorTexture(
  office: OfficeVisualConfig,
  zone: InteriorZone,
  width: number,
  depth: number,
): THREE.CanvasTexture {
  const pack = getOfficeThemePack(office.theme_pack);
  const style = floorKitStyle(pack);
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = office.floor_color;
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    switch (style) {
      case "corporate_tile":
        paintCorporateTile(ctx, office.floor_color);
        break;
      case "clinical_tile":
        paintClinicalTile(ctx, office.floor_color, office.accent_color);
        break;
      default:
        paintOakPlanks(ctx, office.floor_color, zone);
        break;
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  const [repeatX, repeatZ] = floorTextureRepeat(width, depth);
  texture.repeat.set(repeatX, repeatZ);
  return texture;
}

export function createBaseboardMaterial(accentColor: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.62,
    metalness: 0.06,
    emissive: new THREE.Color(accentColor),
    emissiveIntensity: 0.06,
  });
}

export function createWallPlasterMaterial(wallColor: string): THREE.MeshStandardMaterial {
  const boosted = adjustHex(wallColor, 3);
  return new THREE.MeshStandardMaterial({
    color: boosted,
    roughness: 0.9,
    metalness: 0.01,
  });
}

export function floorKitLabel(themePackId: OfficeVisualConfig["theme_pack"]): string {
  const pack = getOfficeThemePack(themePackId);
  switch (floorKitStyle(pack)) {
    case "corporate_tile":
      return "corporate tile";
    case "clinical_tile":
      return "clinical tile";
    default:
      return "oak plank";
  }
}