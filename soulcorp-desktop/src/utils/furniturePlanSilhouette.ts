import * as THREE from "three";
import { loadFurnitureTemplate } from "../components/world/gltfAssetLoader";

const SILHOUETTE_SIZE = 160;
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.OrthographicCamera | null = null;

function ensureScene(): void {
  if (renderer && scene && camera) {
    return;
  }
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(SILHOUETTE_SIZE, SILHOUETTE_SIZE);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  const ambient = new THREE.AmbientLight(0xffffff, 1.05);
  const top = new THREE.DirectionalLight(0xfff8ee, 0.35);
  top.position.set(0, 4, 0);
  scene.add(ambient, top);

  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 20);
}

function frameTopDown(object: THREE.Object3D): void {
  if (!camera) {
    return;
  }
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 0.35);
  const half = span * 0.56;
  camera.left = -half;
  camera.right = half;
  camera.top = half;
  camera.bottom = -half;
  camera.near = 0.05;
  camera.far = span * 6 + 4;
  camera.position.set(center.x, center.y + span * 2.5, center.z);
  camera.up.set(0, 0, -1);
  camera.lookAt(center.x, center.y, center.z);
  camera.updateProjectionMatrix();
}

async function renderTopDownDataUrl(
  gltfPath: string,
  footprint: [number, number],
): Promise<string> {
  ensureScene();
  if (!renderer || !scene || !camera) {
    return "";
  }

  const template = await loadFurnitureTemplate(gltfPath, footprint);
  const object = template.clone(true);
  scene.add(object);
  frameTopDown(object);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  scene.remove(object);
  return url;
}

export function renderFurniturePlanSilhouette(
  catalogId: string,
  gltfPath: string,
  footprint: [number, number],
): Promise<string> {
  const cacheKey = `plan:${catalogId}:${footprint.join("x")}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return Promise.resolve(cached);
  }
  const inflight = pending.get(cacheKey);
  if (inflight) {
    return inflight;
  }
  const promise = renderTopDownDataUrl(gltfPath, footprint)
    .then((url) => {
      if (url) {
        cache.set(cacheKey, url);
      }
      pending.delete(cacheKey);
      return url;
    })
    .catch(() => {
      pending.delete(cacheKey);
      return "";
    });
  pending.set(cacheKey, promise);
  return promise;
}

/** Formats catalog footprint for plan dimension labels (metres). */
export function formatFootprintDimensions(footprint: [number, number]): string {
  const [w, d] = footprint;
  const fmt = (value: number) => (Number.isInteger(value * 100) ? value.toFixed(2) : value.toFixed(2));
  return `${fmt(w)} × ${fmt(d)} m`;
}