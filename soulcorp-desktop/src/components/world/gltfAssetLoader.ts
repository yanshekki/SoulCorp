import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { boostColor } from "./campusPolish";

const loader = new GLTFLoader();
const templateCache = new Map<string, THREE.Group>();
const loadPromises = new Map<string, Promise<THREE.Group>>();

function polishFurnitureMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const geometry = child.geometry;
    const hasVertexColors = geometry.attributes.color !== undefined;
    let material = child.material;

    if (!(material instanceof THREE.MeshStandardMaterial)) {
      material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: hasVertexColors,
        roughness: 0.58,
        metalness: 0.05,
      });
    } else {
      material = material.clone();
      if (hasVertexColors || material.vertexColors) {
        material.vertexColors = true;
        material.color.set(0xffffff);
      } else {
        material.color = boostColor(`#${material.color.getHexString()}`, 1.14, 1.05);
      }
      material.roughness = Math.min(material.roughness, 0.68);
      material.metalness = Math.min(material.metalness, 0.12);
    }

    child.material = material;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function normalizeToFootprint(root: THREE.Group, footprint: [number, number]): void {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  root.position.sub(center);
  root.position.y += size.y / 2;

  const targetW = footprint[0];
  const targetD = footprint[1];
  const scaleX = targetW / Math.max(size.x, 0.001);
  const scaleZ = targetD / Math.max(size.z, 0.001);
  const uniform = Math.min(scaleX, scaleZ);
  root.scale.setScalar(uniform);

  const scaled = new THREE.Box3().setFromObject(root);
  const scaledSize = scaled.getSize(new THREE.Vector3());
  const minHeight = targetD < 0.2 ? scaledSize.y : targetW < 0.55 ? 0.88 : 0.74;
  if (scaledSize.y < minHeight && scaledSize.y > 0.001) {
    root.scale.multiplyScalar(minHeight / scaledSize.y);
  }
}

export async function loadFurnitureTemplate(
  gltfPath: string,
  footprint: [number, number],
): Promise<THREE.Group> {
  const cached = templateCache.get(gltfPath);
  if (cached) return cached;

  let pending = loadPromises.get(gltfPath);
  if (!pending) {
    pending = new Promise<THREE.Group>((resolve, reject) => {
      loader.load(
        gltfPath,
        (gltf) => {
          const root = gltf.scene;
          polishFurnitureMaterials(root);
          normalizeToFootprint(root, footprint);
          templateCache.set(gltfPath, root);
          loadPromises.delete(gltfPath);
          resolve(root);
        },
        undefined,
        (err) => {
          loadPromises.delete(gltfPath);
          reject(err);
        },
      );
    });
    loadPromises.set(gltfPath, pending);
  }

  return pending;
}

export function cloneFurnitureTemplate(template: THREE.Group): THREE.Group {
  return template.clone(true);
}

export async function preloadFurnitureCatalog(
  items: Array<{ gltfPath: string; footprint: [number, number] }>,
): Promise<void> {
  await Promise.all(items.map((item) => loadFurnitureTemplate(item.gltfPath, item.footprint)));
}

export function clearFurnitureCache(): void {
  templateCache.clear();
  loadPromises.clear();
}