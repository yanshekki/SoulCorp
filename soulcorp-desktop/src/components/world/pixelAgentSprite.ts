import * as THREE from "three";
import type { Agent, AgentAppearance } from "../../types/world";

export const WALK_FRAME_COUNT = 4;

const SPRITE_WIDTH = 32;
const SPRITE_HEIGHT = 48;

const DEPARTMENT_ACCENT: Record<string, string> = {
  Engineering: "#5ec8ff",
  "Human Resources": "#ff9bd5",
  Executive: "#ffd166",
  Marketplace: "#f2c879",
};

function darken(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  color.offsetHSL(0, 0, -amount);
  return `#${color.getHexString()}`;
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  size: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(x * size, y * size, w * size, h * size);
}

export function walkFrameIndex(walkPhase: number, walking: boolean): number {
  if (!walking) {
    return 0;
  }
  return Math.abs(Math.floor(walkPhase / (Math.PI / 2))) % WALK_FRAME_COUNT;
}

export function buildPixelAgentCanvas(
  appearance: AgentAppearance,
  department: string,
  frame: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_WIDTH;
  canvas.height = SPRITE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const px = 4;
  const accent = DEPARTMENT_ACCENT[department] ?? appearance.shirtColor;
  const stride = frame % WALK_FRAME_COUNT;
  const legSwing = stride === 1 ? 1 : stride === 3 ? -1 : 0;
  const armSwing = stride === 1 ? -1 : stride === 3 ? 1 : 0;
  const bob = stride === 1 || stride === 3 ? -1 : 0;

  drawRect(ctx, 3, 2 + bob, 6, 2, px, appearance.hairColor);
  drawRect(ctx, 4, 4 + bob, 4, 3, px, appearance.skinColor);
  drawRect(ctx, 3, 7 + bob, 6, 5, px, appearance.shirtColor);
  drawRect(ctx, 2 + armSwing, 8 + bob, 1, 3, px, appearance.skinColor);
  drawRect(ctx, 9 - armSwing, 8 + bob, 1, 3, px, appearance.skinColor);
  drawRect(ctx, 3, 12 + bob, 6, 1, px, darken(appearance.pantsColor, 0.08));
  drawRect(ctx, 3 + Math.max(legSwing, 0), 13 + bob, 2, 3, px, appearance.pantsColor);
  drawRect(ctx, 7 + Math.min(legSwing, 0), 13 + bob, 2, 3, px, appearance.pantsColor);
  drawRect(ctx, 3 + Math.max(legSwing, 0), 16 + bob, 2, 1, px, appearance.shoeColor);
  drawRect(ctx, 7 + Math.min(legSwing, 0), 16 + bob, 2, 1, px, appearance.shoeColor);
  drawRect(ctx, 2 + armSwing, 10 + bob, 1, 2, px, accent);

  return canvas;
}

export function getDepartmentPixelTexture(
  cache: Map<string, THREE.CanvasTexture>,
  department: string,
): THREE.CanvasTexture {
  const key = `dept:${department}`;
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const appearance: AgentAppearance = {
    seed: department,
    skinColor: "#f2c9a0",
    shirtColor: DEPARTMENT_ACCENT[department] ?? "#79a86f",
    pantsColor: "#4f5d7a",
    hairColor: "#3d2b1f",
    shoeColor: "#2f2a28",
    hairStyle: "short",
    height: 1,
    build: 1,
  };
  const canvas = buildPixelAgentCanvas(appearance, department, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, texture);
  return texture;
}

export function getAgentPixelTexture(
  cache: Map<string, THREE.CanvasTexture>,
  agent: Agent,
  frame: number,
): THREE.CanvasTexture {
  const key = `agent:${agent.id}:${frame}`;
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const canvas = buildPixelAgentCanvas(agent.appearance, agent.department, frame);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, texture);
  return texture;
}