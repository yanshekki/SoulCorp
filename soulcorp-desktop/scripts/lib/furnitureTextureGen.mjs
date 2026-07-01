import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { encodePng, fillRgba } from "./pngEncode.mjs";

function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function woodGrain(x, y, w, h) {
  const u = x / w;
  const v = y / h;
  const ring = Math.sin(v * 42 + hash(Math.floor(u * 18), 0) * 2.4) * 0.5 + 0.5;
  const grain = Math.sin(u * 180 + v * 12) * 0.08;
  const base = lerp(0.62, 0.78, ring) + grain;
  const n = hash(x, y) * 0.06;
  const r = Math.min(255, Math.floor((base + n) * 210));
  const g = Math.min(255, Math.floor((base + n - 0.08) * 175));
  const b = Math.min(255, Math.floor((base + n - 0.18) * 135));
  return [r, g, b];
}

function fabricWeave(x, y, w, h, hue = [90, 95, 115]) {
  const u = x / w;
  const v = y / h;
  const warp = (Math.sin(u * 80) + Math.sin(v * 80)) * 0.04;
  const n = hash(x * 3, y * 3) * 0.05;
  const shade = 0.88 + warp + n;
  return hue.map((c) => Math.min(255, Math.floor(c * shade)));
}

function metalBrushed(x, y, w) {
  const u = x / w;
  const streak = Math.sin(u * 320) * 0.04;
  const n = hash(x, y) * 0.03;
  const v = 0.72 + streak + n;
  const c = Math.min(255, Math.floor(v * 195));
  return [c, c, Math.min(255, c + 8)];
}

function plasticMatte(x, y) {
  const n = hash(x, y) * 0.04;
  const v = 0.42 + n;
  const c = Math.floor(v * 95);
  return [c, c + 4, c + 10];
}

function whiteboardSurface(x, y, w, h) {
  const n = hash(x, y) * 0.02;
  const v = 0.97 - n;
  const c = Math.floor(v * 255);
  return [c, c, Math.min(255, c + 2)];
}

function screenGlow(x, y, w, h) {
  const u = x / w;
  const v = y / h;
  const vignette = 1 - Math.hypot(u - 0.5, v - 0.5) * 0.35;
  const band = Math.sin(v * 24) * 0.06;
  const r = Math.floor(lerp(30, 70, vignette + band) * 2.2);
  const g = Math.floor(lerp(110, 180, vignette + band) * 2.2);
  const b = Math.floor(lerp(200, 255, vignette + band) * 2.2);
  return [Math.min(255, r), Math.min(255, g), Math.min(255, b)];
}

function plantLeaves(x, y, w, h) {
  const u = x / w;
  const v = y / h;
  const blob = Math.sin(u * 9 + v * 7) * 0.12 + Math.cos(u * 5 - v * 11) * 0.1;
  const n = hash(x, y) * 0.08;
  const g = Math.floor((0.38 + blob + n) * 180);
  const r = Math.floor(g * 0.55);
  const b = Math.floor(g * 0.45);
  return [r, Math.min(255, g + 30), b];
}

function terracottaPot(x, y) {
  const n = hash(x, y) * 0.06;
  const v = 0.55 + n;
  return [Math.floor(v * 200), Math.floor(v * 120), Math.floor(v * 70)];
}

function accentHoney(x, y, w) {
  const u = x / w;
  const streak = Math.sin(u * 60) * 0.05;
  const v = 0.82 + streak + hash(x, y) * 0.04;
  return [Math.floor(v * 255), Math.floor(v * 168), Math.floor(v * 56)];
}

function posterArt(x, y, w, h) {
  const u = x / w;
  const v = y / h;
  const band = Math.sin(u * 8 + v * 3) * 0.12;
  const sky = 0.42 + band + hash(x, y) * 0.05;
  const r = Math.floor(lerp(40, 120, sky) * 2.1);
  const g = Math.floor(lerp(90, 180, sky + v * 0.08) * 2.1);
  const b = Math.floor(lerp(160, 230, 1 - sky) * 2.1);
  return [Math.min(255, r), Math.min(255, g), Math.min(255, b)];
}

function canvasAbstract(x, y, w, h) {
  const u = x / w;
  const v = y / h;
  const swirl = Math.sin(u * 14 + v * 11) * 0.18 + Math.cos(u * 9 - v * 13) * 0.12;
  const base = 0.55 + swirl + hash(x * 2, y * 2) * 0.08;
  const r = Math.floor(lerp(180, 240, base) * 2.2);
  const g = Math.floor(lerp(120, 200, 1 - base) * 2.0);
  const b = Math.floor(lerp(90, 160, base + u * 0.2) * 2.0);
  return [Math.min(255, r), Math.min(255, g), Math.min(255, b)];
}

function carpetWeave(x, y, w, h) {
  const u = x / w;
  const v = y / h;
  const weave = (Math.sin(u * 48) + Math.sin(v * 48)) * 0.06;
  const n = hash(x, y) * 0.05;
  const shade = 0.62 + weave + n;
  const r = Math.floor(shade * 195);
  const g = Math.floor(shade * 165);
  const b = Math.floor(shade * 130);
  return [r, g, b];
}

const TEXTURE_DEFS = [
  { id: "wood", size: 512, paint: (x, y, w, h) => woodGrain(x, y, w, h) },
  { id: "fabric", size: 512, paint: (x, y, w, h) => fabricWeave(x, y, w, h) },
  { id: "fabric_dark", size: 512, paint: (x, y, w, h) => fabricWeave(x, y, w, h, [45, 48, 58]) },
  { id: "metal", size: 256, paint: (x, y, w) => metalBrushed(x, y, w) },
  { id: "plastic", size: 256, paint: (x, y) => plasticMatte(x, y) },
  { id: "whiteboard", size: 256, paint: (x, y, w, h) => whiteboardSurface(x, y, w, h) },
  { id: "screen", size: 256, paint: (x, y, w, h) => screenGlow(x, y, w, h) },
  { id: "plant", size: 256, paint: (x, y, w, h) => plantLeaves(x, y, w, h) },
  { id: "pot", size: 256, paint: (x, y) => terracottaPot(x, y) },
  { id: "accent", size: 256, paint: (x, y, w) => accentHoney(x, y, w) },
  { id: "laminate", size: 512, paint: (x, y, w, h) => {
    const n = hash(x, y) * 0.04;
    const v = 0.58 + n;
    const c = Math.floor(v * 140);
    return [c, c + 12, c + 22];
  }},
  { id: "poster", size: 256, paint: (x, y, w, h) => posterArt(x, y, w, h) },
  { id: "canvas", size: 256, paint: (x, y, w, h) => canvasAbstract(x, y, w, h) },
  { id: "carpet", size: 512, paint: (x, y, w, h) => carpetWeave(x, y, w, h) },
];

export function generateFurnitureTextures(outDir) {
  mkdirSync(outDir, { recursive: true });
  const paths = {};
  for (const def of TEXTURE_DEFS) {
    const rgba = fillRgba(def.size, def.size, def.paint);
    const png = encodePng(def.size, def.size, rgba);
    const file = `${def.id}.png`;
    writeFileSync(join(outDir, file), png);
    paths[def.id] = `textures/${file}`;
    console.log(`  texture ${file} (${def.size}px)`);
  }
  return paths;
}