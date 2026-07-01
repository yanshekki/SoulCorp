import * as THREE from "three";
import { WORLD_PROPS } from "../../data/worldLayout";
import type { Agent, Building } from "../../types/world";
import { AgentRenderSystem } from "./agentRenderSystem";
import { getPixelBuildingTexture } from "./pixelBuildingTexture";

const ISO_OFFSET = new THREE.Vector3(14, 14, 14);
const cameraTarget = new THREE.Vector3();
const cameraDesired = new THREE.Vector3();

export interface OfficeSceneHandles {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  buildingGroups: Map<string, THREE.Group>;
  agentRenderer: AgentRenderSystem;
  resize: (width: number, height: number) => void;
  raycastBuilding: (normalizedX: number, normalizedY: number) => Building | null;
  dispose: () => void;
}

function createGround(): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#6f9a67";
    ctx.fillRect(0, 0, 64, 64);
    const tile = 16;
    for (let y = 0; y < 64; y += tile) {
      for (let x = 0; x < 64; x += tile) {
        ctx.fillStyle = (x + y) % 32 === 0 ? "#5f8a57" : "#79a86f";
        ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 8);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 22),
    new THREE.MeshStandardMaterial({ map: texture }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

function createBuilding(building: Building): THREE.Group {
  const [width, height, depth] = building.size;
  const [x, , z] = building.position;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.userData.building = building;

  const wallTexture = getPixelBuildingTexture(building);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      map: wallTexture,
      color: "#ffffff",
      flatShading: true,
    }),
  );
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.92, 0.35, depth * 0.92),
    new THREE.MeshStandardMaterial({ color: building.roofColor, flatShading: true }),
  );
  roof.position.y = height + 0.12;
  roof.castShadow = true;

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.75, 0.18, 0.08),
    new THREE.MeshStandardMaterial({ color: building.accentColor, flatShading: true }),
  );
  sign.position.set(0, height + 0.95, depth / 2 + 0.05);

  group.add(body, roof, sign);
  return group;
}

function createPropInstances(scene: THREE.Scene, lowPowerShadows: boolean) {
  const trees = WORLD_PROPS.filter((prop) => prop.type === "tree");
  if (trees.length > 0) {
    const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.16, 0.7, 6);
    const leavesGeometry = new THREE.ConeGeometry(0.55, 1.1, 6);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: "#6d4c35", flatShading: true });
    const leavesMaterial = new THREE.MeshStandardMaterial({ color: "#4f8a57", flatShading: true });
    const trunkMesh = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
    const leavesMesh = new THREE.InstancedMesh(leavesGeometry, leavesMaterial, trees.length);
    const temp = new THREE.Object3D();

    trees.forEach((tree, index) => {
      const scale = tree.scale ?? 1;
      temp.position.set(tree.position[0], 0.35 * scale, tree.position[2]);
      temp.scale.setScalar(scale);
      temp.updateMatrix();
      trunkMesh.setMatrixAt(index, temp.matrix);

      temp.position.set(tree.position[0], 1.05 * scale, tree.position[2]);
      temp.updateMatrix();
      leavesMesh.setMatrixAt(index, temp.matrix);
    });

    trunkMesh.instanceMatrix.needsUpdate = true;
    leavesMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.castShadow = !lowPowerShadows;
    leavesMesh.castShadow = !lowPowerShadows;
    scene.add(trunkMesh, leavesMesh);
  }

  const props = WORLD_PROPS.filter((prop) => prop.type !== "tree");
  for (const prop of props) {
    let mesh: THREE.Mesh;
    if (prop.type === "bench") {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.22, 0.42),
        new THREE.MeshStandardMaterial({ color: "#8b6a4f", flatShading: true }),
      );
      mesh.position.y = 0.18;
    } else if (prop.type === "lamp") {
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.07, 1.3, 6),
        new THREE.MeshStandardMaterial({ color: "#5f6d82", flatShading: true }),
      );
      mesh.position.y = 0.65;
    } else {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.45, 0.7),
        new THREE.MeshStandardMaterial({ color: "#6f9a67", flatShading: true }),
      );
      mesh.position.y = 0.22;
    }

    mesh.position.x = prop.position[0];
    mesh.position.z = prop.position[2];
    if (prop.rotation) {
      mesh.rotation.y = prop.rotation;
    }
    mesh.castShadow = !lowPowerShadows;
    scene.add(mesh);
  }
}

export class OfficeSceneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfficeSceneError";
  }
}

function assertWebGLContext(canvas: HTMLCanvasElement): void {
  const probe =
    canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) ??
    canvas.getContext("webgl", { failIfMajorPerformanceCaveat: false }) ??
    canvas.getContext("experimental-webgl", { failIfMajorPerformanceCaveat: false });

  if (!probe) {
    throw new OfficeSceneError(
      "WebGL context could not be created. Check GPU drivers and hardware acceleration.",
    );
  }
}

export function createOfficeScene(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  lowPowerMode = false,
): OfficeSceneHandles {
  if (width < 1 || height < 1) {
    throw new OfficeSceneError(`Invalid canvas size: ${width}x${height}`);
  }

  assertWebGLContext(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#8ec8ef");
  scene.fog = new THREE.Fog("#b7daf5", 22, 58);

  const aspect = width / Math.max(height, 1);
  const frustum = 14;
  const camera = new THREE.OrthographicCamera(
    (-frustum * aspect) / 2,
    (frustum * aspect) / 2,
    frustum / 2,
    -frustum / 2,
    0.1,
    500,
  );
  camera.position.copy(ISO_OFFSET);
  camera.lookAt(0, 0, 0);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
      preserveDrawingBuffer: true,
    });
  } catch (error) {
    throw new OfficeSceneError(
      `WebGLRenderer failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!renderer.getContext()) {
    renderer.dispose();
    throw new OfficeSceneError("WebGLRenderer returned no rendering context.");
  }

  const pixelRatio = lowPowerMode
    ? 1
    : Math.min(window.devicePixelRatio, 2);
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor("#8ec8ef", 1);
  renderer.shadowMap.enabled = !lowPowerMode;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(createGround());

  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(3.5, 14),
    new THREE.MeshStandardMaterial({ color: "#c7b08a", flatShading: true }),
  );
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.02, 1.5);
  scene.add(path);

  createPropInstances(scene, lowPowerMode);

  const ambient = new THREE.AmbientLight(0xffffff, lowPowerMode ? 0.8 : 0.65);
  const sun = new THREE.DirectionalLight(0xfff2d6, lowPowerMode ? 0.9 : 1.2);
  sun.position.set(12, 20, 8);
  sun.castShadow = !lowPowerMode;
  sun.shadow.mapSize.set(lowPowerMode ? 512 : 1024, lowPowerMode ? 512 : 1024);
  scene.add(ambient, sun);

  const buildingGroups = new Map<string, THREE.Group>();
  const agentRenderer = new AgentRenderSystem(scene);
  const raycaster = new THREE.Raycaster();

  renderer.render(scene, camera);

  return {
    scene,
    camera,
    renderer,
    buildingGroups,
    agentRenderer,
    resize(nextWidth: number, nextHeight: number) {
      const nextAspect = nextWidth / Math.max(nextHeight, 1);
      camera.left = (-frustum * nextAspect) / 2;
      camera.right = (frustum * nextAspect) / 2;
      camera.top = frustum / 2;
      camera.bottom = -frustum / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight, false);
    },
    raycastBuilding(normalizedX: number, normalizedY: number) {
      raycaster.setFromCamera(new THREE.Vector2(normalizedX, normalizedY), camera);
      const hits = raycaster.intersectObjects(
        Array.from(buildingGroups.values()),
        true,
      );
      for (const hit of hits) {
        let node: THREE.Object3D | null = hit.object;
        while (node) {
          if (node.userData.building) {
            return node.userData.building as Building;
          }
          node = node.parent;
        }
      }
      return null;
    },
    dispose() {
      agentRenderer.dispose();
      renderer.dispose();
      scene.clear();
    },
  };
}

export function syncSceneAgents(
  handles: OfficeSceneHandles,
  agents: Agent[],
  lowPowerMode = false,
) {
  handles.agentRenderer.sync(agents, handles.camera, lowPowerMode);
}

export function syncSceneBuildings(handles: OfficeSceneHandles, buildings: Building[]) {
  const seen = new Set<string>();
  for (const building of buildings) {
    seen.add(building.id);
    if (!handles.buildingGroups.has(building.id)) {
      const group = createBuilding(building);
      handles.buildingGroups.set(building.id, group);
      handles.scene.add(group);
    }
  }
  for (const [id, group] of handles.buildingGroups) {
    if (!seen.has(id)) {
      handles.scene.remove(group);
      handles.buildingGroups.delete(id);
    }
  }
}

export function updateCamera(
  camera: THREE.OrthographicCamera,
  selectedBuilding: Building | null,
  delta: number,
) {
  if (selectedBuilding) {
    const [x, , z] = selectedBuilding.position;
    cameraTarget.set(x, 0, z);
    cameraDesired.set(x + 7, 10, z + 7);
    camera.position.lerp(cameraDesired, Math.min(delta * 2.5, 1));
    camera.lookAt(cameraTarget);
    return;
  }
  camera.position.lerp(ISO_OFFSET, Math.min(delta * 2, 1));
  camera.lookAt(0, 0, 0);
}

export function renderScene(handles: OfficeSceneHandles) {
  handles.renderer.render(handles.scene, handles.camera);
}