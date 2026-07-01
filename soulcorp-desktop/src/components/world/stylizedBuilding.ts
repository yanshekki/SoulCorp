import * as THREE from "three";
import type { Building } from "../../types/world";
import type { BuildingStyle, BuildingVisualConfig } from "../../types/visualDesign";
import { addMeshOutline, boostColor } from "./campusPolish";

export interface StylizedBuildingParts {
  group: THREE.Group;
  door: THREE.Mesh;
  plaque: THREE.Mesh;
  body: THREE.Mesh;
}

function windowEmissive(nightMode: boolean, style: BuildingStyle): number {
  if (style === "glass") {
    return nightMode ? 0.75 : 0.15;
  }
  return nightMode ? 0.5 : 0.08;
}

function facadeRoughness(style: BuildingStyle): number {
  switch (style) {
    case "glass":
      return 0.12;
    case "industrial":
      return 0.88;
    case "classic":
      return 0.72;
    case "startup":
      return 0.5;
    default:
      return 0.55;
  }
}

function createSignTexture(name: string, accent: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = accent;
    roundRect(ctx, 8, 10, 240, 44, 8);
    ctx.fill();
    ctx.fillStyle = "#1a2438";
    ctx.font = "bold 22px system-ui, sans-serif";
    const text = name.length > 18 ? `${name.slice(0, 16)}…` : name;
    ctx.fillText(text, 20, 40);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function bodyMaterial(
  color: string,
  style: BuildingStyle,
  accent: string,
  nightMode: boolean,
): THREE.MeshStandardMaterial {
  const boosted = boostColor(color);
  return new THREE.MeshStandardMaterial({
    color: boosted,
    roughness: facadeRoughness(style),
    metalness: style === "glass" || style === "industrial" ? 0.28 : 0.06,
    emissive: style === "glass" ? accent : "#000000",
    emissiveIntensity: style === "glass" ? windowEmissive(nightMode, style) * 0.35 : 0,
    flatShading: style === "startup" || style === "industrial",
  });
}

function addStyleGeometry(
  group: THREE.Group,
  style: BuildingStyle,
  width: number,
  height: number,
  depth: number,
  facadeColor: string,
  accent: string,
  roofColor: string,
  nightMode: boolean,
): THREE.Mesh {
  let body: THREE.Mesh;

  switch (style) {
    case "glass": {
      body = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        bodyMaterial(facadeColor, style, accent, nightMode),
      );
      body.position.y = height / 2;
      for (let row = 0; row < 3; row += 1) {
        for (let col = -1; col <= 1; col += 1) {
          const pane = new THREE.Mesh(
            new THREE.PlaneGeometry(width * 0.22, height * 0.18),
            new THREE.MeshStandardMaterial({
              color: "#d8ecff",
              emissive: accent,
              emissiveIntensity: windowEmissive(nightMode, style),
              transparent: true,
              opacity: 0.72,
              metalness: 0.45,
              roughness: 0.1,
            }),
          );
          pane.position.set(col * width * 0.28, height * (0.35 + row * 0.22), depth / 2 + 0.03);
          group.add(pane);
        }
      }
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(width * 1.02, 0.12, depth * 1.02),
        new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.35, metalness: 0.2 }),
      );
      cap.position.y = height + 0.06;
      group.add(cap);
      break;
    }
    case "classic": {
      body = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.92, height * 0.82, depth * 0.92),
        bodyMaterial("#d8cfc0", style, accent, nightMode),
      );
      body.position.y = height * 0.41;
      const pediment = new THREE.Mesh(
        new THREE.BoxGeometry(width, height * 0.12, depth * 0.35),
        new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.65 }),
      );
      pediment.position.set(0, height * 0.9, depth * 0.28);
      const columnGeo = new THREE.CylinderGeometry(0.1, 0.12, height * 0.55, 6);
      const columnMat = new THREE.MeshStandardMaterial({ color: "#e8e2d8", roughness: 0.7 });
      for (const x of [-width * 0.35, width * 0.35]) {
        const column = new THREE.Mesh(columnGeo, columnMat);
        column.position.set(x, height * 0.28, depth * 0.42);
        group.add(column);
      }
      group.add(pediment);
      break;
    }
    case "industrial": {
      body = new THREE.Mesh(
        new THREE.BoxGeometry(width, height * 0.75, depth),
        bodyMaterial("#7a8494", style, accent, nightMode),
      );
      body.position.y = height * 0.375;
      for (let index = 0; index < 3; index += 1) {
        const saw = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.28, 0.18, depth * 0.9),
          new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.8, metalness: 0.15 }),
        );
        saw.position.set(-width * 0.28 + index * width * 0.28, height * 0.82, 0);
        saw.rotation.z = index % 2 === 0 ? 0.12 : -0.12;
        group.add(saw);
      }
      const vent = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.2, 0.35, 0.08),
        new THREE.MeshStandardMaterial({
          color: "#3a4558",
          emissive: nightMode ? "#5577aa" : "#000000",
          emissiveIntensity: nightMode ? 0.4 : 0,
        }),
      );
      vent.position.set(width * 0.3, height * 0.55, depth / 2 + 0.05);
      group.add(vent);
      break;
    }
    case "startup": {
      body = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.95, height * 0.78, depth * 0.95),
        bodyMaterial("#f2f0ea", style, accent, nightMode),
      );
      body.position.y = height * 0.39;
      const accentBlock = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.35, height * 0.22, 0.12),
        new THREE.MeshStandardMaterial({
          color: accent,
          emissive: accent,
          emissiveIntensity: nightMode ? 0.25 : 0.08,
          roughness: 0.45,
        }),
      );
      accentBlock.position.set(-width * 0.2, height * 0.62, depth / 2 + 0.04);
      const slopedRoof = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.14, depth * 0.7),
        new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.55 }),
      );
      slopedRoof.position.set(0, height * 0.86, -depth * 0.08);
      slopedRoof.rotation.x = -0.18;
      group.add(accentBlock, slopedRoof);
      break;
    }
    default: {
      body = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        bodyMaterial(facadeColor, style, accent, nightMode),
      );
      body.position.y = height / 2;
      const windowStrip = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.88, height * 0.55, depth * 0.02),
        new THREE.MeshStandardMaterial({
          color: "#d8ecff",
          emissive: accent,
          emissiveIntensity: windowEmissive(nightMode, style),
          roughness: 0.2,
          metalness: 0.35,
        }),
      );
      windowStrip.position.set(0, height * 0.55, depth / 2 + 0.02);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(width * 1.04, 0.28, depth * 1.04),
        new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.7 }),
      );
      roof.position.y = height + 0.1;
      const overhang = new THREE.Mesh(
        new THREE.BoxGeometry(width * 1.08, 0.08, depth * 0.42),
        new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.65 }),
      );
      overhang.position.set(0, height + 0.22, depth / 2 + 0.1);
      group.add(windowStrip, roof, overhang);
      break;
    }
  }

  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.hoverAccent = accent;
  addMeshOutline(group, body);
  group.add(body);
  return body;
}

export function buildingVisualSignature(
  building: Building,
  config?: BuildingVisualConfig,
): string {
  const style = config?.style ?? "modern";
  const signage = config?.signage ?? building.name;
  const size = config?.size ?? building.size;
  return [
    building.id,
    building.color,
    building.roofColor,
    building.accentColor,
    size.join(","),
    signage,
    style,
  ].join(":");
}

export function createStylizedBuilding(
  building: Building,
  config: BuildingVisualConfig | undefined,
  nightMode: boolean,
): StylizedBuildingParts {
  const style = config?.style ?? "modern";
  const [width, height, depth] = config?.size ?? building.size;
  const accent = building.accentColor;
  const roofColor = building.roofColor;
  const displayName = config?.signage?.trim() || building.name;

  const group = new THREE.Group();
  group.position.set(building.position[0], 0, building.position[2]);
  group.userData.building = building;
  group.userData.buildingId = building.id;

  const body = addStyleGeometry(
    group,
    style,
    width,
    height,
    depth,
    building.color,
    accent,
    roofColor,
    nightMode,
  );

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.28, height * 0.42, 0.12),
    new THREE.MeshStandardMaterial({
      color: "#3d4a5c",
      emissive: new THREE.Color(accent),
      emissiveIntensity: 0.05,
      roughness: 0.5,
    }),
  );
  door.position.set(0, height * 0.21, depth / 2 + 0.08);
  door.userData.isDoor = true;
  door.userData.buildingId = building.id;

  const plaqueTexture = createSignTexture(displayName, accent);
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.72, 0.42),
    new THREE.MeshStandardMaterial({
      map: plaqueTexture,
      transparent: true,
      roughness: 0.8,
    }),
  );
  plaque.position.set(0, height + 0.72, depth / 2 + 0.1);
  plaque.userData.isPlaque = true;
  plaque.userData.buildingId = building.id;

  group.add(door, plaque);
  return { group, door, plaque, body };
}

export function setBuildingHover(parts: StylizedBuildingParts, hovered: boolean): void {
  const doorMat = parts.door.material as THREE.MeshStandardMaterial;
  doorMat.emissiveIntensity = hovered ? 0.45 : 0.05;
  parts.plaque.scale.setScalar(hovered ? 1.06 : 1);
  const bodyMat = parts.body.material as THREE.MeshStandardMaterial;
  bodyMat.emissive.set(hovered ? parts.body.userData.hoverAccent ?? "#5ec8ff" : "#000000");
  bodyMat.emissiveIntensity = hovered ? 0.12 : 0;
}