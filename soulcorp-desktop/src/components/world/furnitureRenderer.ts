import * as THREE from "three";
import type { FurnitureCatalogEntry } from "../../data/furnitureCatalog";
import type { FurnitureInstance } from "../../types/visualDesign";
import { FURNITURE_DISPLAY_SCALE } from "../../utils/interiorScale";
import { cloneFurnitureTemplate, loadFurnitureTemplate } from "./gltfAssetLoader";

function applyAccentToMesh(mesh: THREE.Mesh, accent: string): void {
  const mat = mesh.material;
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  const clone = mat.clone();
  const name = mesh.name.toLowerCase();
  if (name.includes("accent") || name.includes("screen")) {
    clone.color.set(accent);
    clone.emissive.set(accent);
    clone.emissiveIntensity = 0.15;
  }
  mesh.material = clone;
}

function applyAccentColors(root: THREE.Object3D, accent: string): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      applyAccentToMesh(child, accent);
    }
  });
}

function createFallbackMesh(
  catalogId: string,
  footprint: [number, number],
  accent: string,
): THREE.Group {
  const [w, d] = footprint;
  if (catalogId === "floor_lamp") {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 1.35, 8),
      new THREE.MeshStandardMaterial({ color: "#5a4a3a", roughness: 0.6, metalness: 0.15 }),
    );
    pole.position.y = 0.68;
    pole.castShadow = true;
    pole.userData.isFallback = true;
    group.add(pole);
    const shade = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 10),
      new THREE.MeshStandardMaterial({
        color: "#fff2d0",
        emissive: accent,
        emissiveIntensity: 0.45,
        roughness: 0.35,
      }),
    );
    shade.position.y = 1.42;
    shade.castShadow = true;
    shade.userData.isFallback = true;
    group.add(shade);
    return group;
  }

  const height = catalogId.includes("desk") ? 0.72 : catalogId.includes("chair") ? 0.9 : 1.0;
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.92, height * 0.88, d * 0.92),
    new THREE.MeshStandardMaterial({
      color: catalogId.includes("plant")
        ? "#4a8f55"
        : catalogId.includes("chair")
          ? "#3a4250"
          : "#8a7d6e",
      roughness: 0.58,
      metalness: 0.06,
    }),
  );
  body.position.y = height * 0.44;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.isFallback = true;
  group.add(body);

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.96, height * 0.08, d * 0.96),
    new THREE.MeshStandardMaterial({
      color: "#f2ebe2",
      roughness: 0.35,
      metalness: 0.04,
    }),
  );
  top.position.y = height * 0.92;
  top.castShadow = true;
  top.userData.isFallback = true;
  group.add(top);

  return group;
}

export async function createFurnitureObject(
  item: FurnitureInstance,
  catalogEntry: FurnitureCatalogEntry,
  accent: string,
): Promise<THREE.Object3D> {
  let object: THREE.Object3D;

  try {
    const template = await loadFurnitureTemplate(catalogEntry.gltfPath, catalogEntry.footprint);
    object = cloneFurnitureTemplate(template);
    applyAccentColors(object, accent);
    object.userData.fromGltf = true;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(`Furniture GLTF failed for ${item.catalog_id}`, error);
    }
    object = createFallbackMesh(item.catalog_id, catalogEntry.footprint, accent);
    object.userData.fromGltf = false;
  }

  object.position.set(item.position[0], item.position[1], item.position[2]);
  object.rotation.y = item.rotation_y;
  object.scale.multiplyScalar(FURNITURE_DISPLAY_SCALE);
  if (item.scale) {
    object.scale.multiplyScalar(item.scale);
  }
  object.userData.furnitureId = item.id;
  object.userData.catalogId = item.catalog_id;
  object.userData.isDesk = catalogEntry.category === "desk" && catalogEntry.id !== "reception_desk";
  object.userData.isTech = catalogEntry.category === "tech";

  return object;
}

export function disposeFurnitureObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    if (child.userData.isFallback) {
      child.geometry.dispose();
    }
    const mat = child.material;
    if (Array.isArray(mat)) {
      mat.forEach((m) => m.dispose());
    } else {
      mat.dispose();
    }
  });
}