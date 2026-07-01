import * as THREE from "three";
import { loadFurnitureTemplate } from "../components/world/gltfAssetLoader";

const THUMB_SIZE = 96;
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.OrthographicCamera | null = null;
let ambient: THREE.AmbientLight | null = null;
let keyLight: THREE.DirectionalLight | null = null;
let fillLight: THREE.DirectionalLight | null = null;

function ensurePreviewScene(): void {
  if (renderer && scene && camera) {
    return;
  }

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(THUMB_SIZE, THUMB_SIZE);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2230);

  ambient = new THREE.AmbientLight(0xffffff, 0.82);
  keyLight = new THREE.DirectionalLight(0xfff0d8, 1.15);
  keyLight.position.set(2.4, 3.6, 2.2);
  fillLight = new THREE.DirectionalLight(0xb8ccff, 0.5);
  fillLight.position.set(-2.2, 1.4, -1.6);
  scene.add(ambient, keyLight, fillLight);

  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 20);
  camera.position.set(2.1, 1.55, 2.1);
  camera.lookAt(0, 0.42, 0);
}

function frameCameraToObject(object: THREE.Object3D): void {
  if (!camera) {
    return;
  }
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.5);
  const padding = 1.28;
  const half = maxDim * padding * 0.55;
  camera.left = -half;
  camera.right = half;
  camera.top = half;
  camera.bottom = -half;
  camera.near = 0.05;
  camera.far = maxDim * 8 + 4;
  camera.position.set(center.x + maxDim * 1.35, center.y + maxDim * 0.95, center.z + maxDim * 1.35);
  camera.lookAt(center.x, center.y + size.y * 0.08, center.z);
  camera.updateProjectionMatrix();
}

async function renderPreviewDataUrl(
  gltfPath: string,
  footprint: [number, number],
): Promise<string> {
  ensurePreviewScene();
  if (!renderer || !scene || !camera) {
    return "";
  }

  const template = await loadFurnitureTemplate(gltfPath, footprint);
  const object = template.clone(true);
  scene.add(object);
  frameCameraToObject(object);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  scene.remove(object);
  return url;
}

export function renderFurniturePreviewUrl(
  catalogId: string,
  gltfPath: string,
  footprint: [number, number],
): Promise<string> {
  const cacheKey = `${catalogId}:${footprint.join("x")}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return Promise.resolve(cached);
  }

  const inflight = pending.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const promise = renderPreviewDataUrl(gltfPath, footprint)
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