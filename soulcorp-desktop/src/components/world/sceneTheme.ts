import * as THREE from "three";
import type { CampusThemeConfig } from "../../types/visualDesign";
import { boostColor, createCampusPathTexture, createSkyDome } from "./campusPolish";

export interface ThemeHandles {
  groundMesh: THREE.Mesh;
  pathMesh: THREE.Mesh;
  skyDome: THREE.Mesh;
  ambient: THREE.AmbientLight;
  hemisphere: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
}

export function applyCampusTheme(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  campus: CampusThemeConfig,
  handles: ThemeHandles,
  lowPowerMode: boolean,
): void {
  const skyTop = new THREE.Color(campus.sky_top);
  const skyBottom = new THREE.Color(campus.sky_bottom);

  scene.background = skyTop.clone().lerp(skyBottom, 0.35);
  scene.fog = new THREE.Fog(skyBottom.getHex(), 22, 58);
  renderer.setClearColor(skyTop, 1);

  const groundMat = handles.groundMesh.material as THREE.MeshStandardMaterial;
  groundMat.color.copy(boostColor(campus.ground_primary, 1.08, 1.02));
  groundMat.needsUpdate = true;

  const pathMat = handles.pathMesh.material as THREE.MeshStandardMaterial;
  pathMat.color.copy(boostColor(campus.ground_secondary, 1.05, 1.03));
  pathMat.needsUpdate = true;

  const skyColors = handles.skyDome.geometry.attributes.color as THREE.BufferAttribute;
  const top = boostColor(campus.sky_top);
  const bottom = boostColor(campus.sky_bottom);
  const positions = handles.skyDome.geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index);
    const t = THREE.MathUtils.clamp((y + 2) / 40, 0, 1);
    const mixed = bottom.clone().lerp(top, t);
    skyColors.setXYZ(index, mixed.r, mixed.g, mixed.b);
  }
  skyColors.needsUpdate = true;

  const intensity = campus.ambient_intensity;
  handles.ambient.intensity = lowPowerMode ? intensity * 0.95 : intensity * 0.75;
  handles.hemisphere.intensity = lowPowerMode ? intensity * 0.7 : intensity;
  handles.sun.intensity = lowPowerMode ? intensity * 1.05 : intensity * 1.35;
  handles.rim.intensity = lowPowerMode ? intensity * 0.35 : intensity * 0.55;
}

export function createThemedGround(campus: CampusThemeConfig): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = campus.ground_primary;
    ctx.fillRect(0, 0, 64, 64);
    const tile = 16;
    for (let y = 0; y < 64; y += tile) {
      for (let x = 0; x < 64; x += tile) {
        ctx.fillStyle = (x + y) % 32 === 0 ? campus.ground_secondary : campus.ground_primary;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
        ctx.globalAlpha = 1;
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 8);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 22),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

export function createThemeLights(
  lowPowerMode: boolean,
): Omit<ThemeHandles, "groundMesh" | "pathMesh" | "skyDome"> {
  const ambient = new THREE.AmbientLight(0xffffff, lowPowerMode ? 0.7 : 0.55);
  const hemisphere = new THREE.HemisphereLight(0xddeeff, 0x6f8a5a, lowPowerMode ? 0.55 : 0.7);
  const sun = new THREE.DirectionalLight(0xfff2d6, lowPowerMode ? 0.95 : 1.25);
  sun.position.set(12, 20, 8);
  sun.castShadow = !lowPowerMode;
  sun.shadow.mapSize.set(lowPowerMode ? 512 : 1024, lowPowerMode ? 512 : 1024);
  const rim = new THREE.DirectionalLight(0xffc8a0, lowPowerMode ? 0.35 : 0.55);
  rim.position.set(-10, 8, -12);
  return { ambient, hemisphere, sun, rim };
}

export function createCampusSky(campus: CampusThemeConfig): THREE.Mesh {
  return createSkyDome(campus.sky_top, campus.sky_bottom);
}

export function createCampusPath(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 14),
    new THREE.MeshStandardMaterial({
      map: createCampusPathTexture(),
      roughness: 0.88,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0.02, 1.5);
  mesh.receiveShadow = true;
  return mesh;
}

export function isNightCampus(campus: CampusThemeConfig): boolean {
  const top = new THREE.Color(campus.sky_top);
  const hsl = { h: 0, s: 0, l: 0 };
  top.getHSL(hsl);
  return hsl.l < 0.35;
}