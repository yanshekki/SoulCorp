import * as THREE from "three";
import type { WorldProp } from "../../types/world";

export function boostColor(hex: string, saturation = 1.12, lightness = 1.04): THREE.Color {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, Math.min(1, hsl.s * saturation), Math.min(1, hsl.l * lightness));
  return color;
}

export function createSkyDome(topColor: string, bottomColor: string): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(80, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const top = new THREE.Color(topColor);
  const bottom = new THREE.Color(bottomColor);
  const colors: number[] = [];
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index);
    const t = THREE.MathUtils.clamp((y + 2) / 40, 0, 1);
    const mixed = bottom.clone().lerp(top, t);
    colors.push(mixed.r, mixed.g, mixed.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -2;
  mesh.renderOrder = -10;
  return mesh;
}

export function createCampusPathTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#c4a574";
    ctx.fillRect(0, 0, 128, 128);
    const tile = 16;
    for (let y = 0; y < 128; y += tile) {
      for (let x = 0; x < 128; x += tile) {
        const shade = (x + y) % 32 === 0 ? "#b89563" : "#d0b080";
        ctx.fillStyle = shade;
        ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
        ctx.strokeStyle = "rgba(90, 70, 45, 0.25)";
        ctx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 4);
  return texture;
}

export function addMeshOutline(
  parent: THREE.Object3D,
  source: THREE.Mesh,
  outlineColor = "#1a2230",
  scale = 1.03,
): THREE.Mesh {
  const outline = new THREE.Mesh(
    source.geometry,
    new THREE.MeshBasicMaterial({
      color: outlineColor,
      side: THREE.BackSide,
    }),
  );
  outline.position.copy(source.position);
  outline.rotation.copy(source.rotation);
  outline.scale.copy(source.scale).multiplyScalar(scale);
  outline.renderOrder = source.renderOrder - 1;
  parent.add(outline);
  return outline;
}

export function createCampusProp(prop: WorldProp, lowPowerShadows: boolean): THREE.Object3D {
  const scale = prop.scale ?? 1;
  const group = new THREE.Group();
  group.position.set(prop.position[0], 0, prop.position[2]);
  if (prop.rotation) {
    group.rotation.y = prop.rotation;
  }

  if (prop.type === "tree") {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12 * scale, 0.16 * scale, 0.8 * scale, 6),
      new THREE.MeshStandardMaterial({ color: "#6d4c35", roughness: 0.88, flatShading: true }),
    );
    trunk.position.y = 0.4 * scale;
    trunk.castShadow = !lowPowerShadows;

    const foliage = new THREE.Mesh(
      new THREE.ConeGeometry(0.55 * scale, 1.1 * scale, 7),
      new THREE.MeshStandardMaterial({ color: "#4f8a57", roughness: 0.72, flatShading: true }),
    );
    foliage.position.y = 1.15 * scale;
    foliage.castShadow = !lowPowerShadows;

    const foliage2 = new THREE.Mesh(
      new THREE.ConeGeometry(0.42 * scale, 0.75 * scale, 7),
      new THREE.MeshStandardMaterial({ color: "#5fa868", roughness: 0.7, flatShading: true }),
    );
    foliage2.position.y = 1.55 * scale;
    group.add(trunk, foliage, foliage2);
    return group;
  }

  if (prop.type === "bench") {
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(1.25 * scale, 0.08 * scale, 0.42 * scale),
      new THREE.MeshStandardMaterial({ color: "#8b6a4f", roughness: 0.75 }),
    );
    seat.position.y = 0.42 * scale;
    const legGeo = new THREE.BoxGeometry(0.08 * scale, 0.42 * scale, 0.35 * scale);
    const legMat = new THREE.MeshStandardMaterial({ color: "#5c4a38", roughness: 0.8 });
    const legs = [
      [-0.48, 0.21, 0],
      [0.48, 0.21, 0],
    ].map(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(x * scale, y * scale, z);
      return leg;
    });
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(1.25 * scale, 0.35 * scale, 0.06 * scale),
      legMat,
    );
    back.position.set(0, 0.62 * scale, -0.18 * scale);
    group.add(seat, ...legs, back);
    return group;
  }

  if (prop.type === "lamp") {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04 * scale, 0.06 * scale, 1.4 * scale, 8),
      new THREE.MeshStandardMaterial({ color: "#5f6d82", metalness: 0.25, roughness: 0.45 }),
    );
    pole.position.y = 0.7 * scale;
    const lampHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.14 * scale, 8, 8),
      new THREE.MeshStandardMaterial({
        color: "#fff2c8",
        emissive: "#ffcc66",
        emissiveIntensity: 0.55,
        roughness: 0.3,
      }),
    );
    lampHead.position.y = 1.42 * scale;
    group.add(pole, lampHead);
    return group;
  }

  const planter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32 * scale, 0.38 * scale, 0.42 * scale, 8),
    new THREE.MeshStandardMaterial({ color: "#8a6a52", roughness: 0.8 }),
  );
  planter.position.y = 0.21 * scale;
  const plant = new THREE.Mesh(
    new THREE.SphereGeometry(0.28 * scale, 8, 8),
    new THREE.MeshStandardMaterial({ color: "#6f9a67", roughness: 0.75 }),
  );
  plant.position.y = 0.55 * scale;
  group.add(planter, plant);
  return group;
}