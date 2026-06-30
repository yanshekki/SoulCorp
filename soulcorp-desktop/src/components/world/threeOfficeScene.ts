import * as THREE from "three";
import type { Agent, Building } from "../../types/world";

const ISO_OFFSET = new THREE.Vector3(14, 14, 14);

export interface OfficeSceneHandles {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  buildingGroups: Map<string, THREE.Group>;
  agentGroups: Map<string, THREE.Group>;
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

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color: building.color }),
  );
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.92, 0.35, depth * 0.92),
    new THREE.MeshStandardMaterial({ color: building.roofColor }),
  );
  roof.position.y = height + 0.12;
  roof.castShadow = true;

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.75, 0.18, 0.08),
    new THREE.MeshStandardMaterial({ color: building.accentColor }),
  );
  sign.position.set(0, height + 0.95, depth / 2 + 0.05);

  group.add(body, roof, sign);
  return group;
}

function createHumanoid(agent: Agent): THREE.Group {
  const group = new THREE.Group();
  group.userData.agentId = agent.id;
  const { appearance } = agent;
  const scale = appearance.height * appearance.build;

  const body = new THREE.Group();
  body.scale.setScalar(scale);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 12),
    new THREE.MeshStandardMaterial({ color: appearance.skinColor }),
  );
  head.position.y = 1.35;

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.55, 0.24),
    new THREE.MeshStandardMaterial({ color: appearance.shirtColor }),
  );
  torso.position.y = 0.82;

  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.32, 0.22),
    new THREE.MeshStandardMaterial({ color: appearance.pantsColor }),
  );
  legs.position.y = 0.5;

  const hair = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.16, 0.4),
    new THREE.MeshStandardMaterial({ color: appearance.hairColor }),
  );
  hair.position.y = 1.52;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.42, 20),
    new THREE.MeshBasicMaterial({ color: agent.color, transparent: true, opacity: 0.55 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;

  body.add(head, hair, torso, legs);
  group.add(body, ring);
  return group;
}

function updateHumanoid(group: THREE.Group, agent: Agent) {
  group.position.set(agent.position[0], agent.position[1], agent.position[2]);
  const body = group.children[0] as THREE.Group;
  const walking = agent.status === "walking";
  const swing = walking ? Math.sin(agent.walkPhase) * 0.45 : 0;
  const bob = walking ? Math.abs(Math.sin(agent.walkPhase)) * 0.05 : 0;
  body.position.y = bob;
  group.rotation.y = Math.atan2(
    agent.target[0] - agent.position[0],
    agent.target[2] - agent.position[2],
  );
  body.rotation.z = swing * 0.08;
}

export function createOfficeScene(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): OfficeSceneHandles {
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

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "default",
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(createGround());

  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(3.5, 14),
    new THREE.MeshStandardMaterial({ color: "#c7b08a" }),
  );
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.02, 1.5);
  scene.add(path);

  for (const [x, z, scale] of [
    [-10, -4, 1.1],
    [9, 3, 0.95],
    [-8, 6, 1.2],
  ] as const) {
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    tree.scale.setScalar(scale);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: "#6d4c35" }),
    );
    trunk.position.y = 0.35;
    const leaves = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 1.1, 8),
      new THREE.MeshStandardMaterial({ color: "#4f8a57" }),
    );
    leaves.position.y = 1.05;
    tree.add(trunk, leaves);
    scene.add(tree);
  }

  const ambient = new THREE.AmbientLight(0xffffff, 0.65);
  const sun = new THREE.DirectionalLight(0xfff2d6, 1.2);
  sun.position.set(12, 20, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(ambient, sun);

  const buildingGroups = new Map<string, THREE.Group>();
  const agentGroups = new Map<string, THREE.Group>();
  const raycaster = new THREE.Raycaster();

  return {
    scene,
    camera,
    renderer,
    buildingGroups,
    agentGroups,
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
      renderer.dispose();
      scene.clear();
    },
  };
}

export function syncSceneAgents(handles: OfficeSceneHandles, agents: Agent[]) {
  const seen = new Set<string>();
  for (const agent of agents) {
    seen.add(agent.id);
    let group = handles.agentGroups.get(agent.id);
    if (!group) {
      group = createHumanoid(agent);
      handles.agentGroups.set(agent.id, group);
      handles.scene.add(group);
    }
    updateHumanoid(group, agent);
  }
  for (const [id, group] of handles.agentGroups) {
    if (!seen.has(id)) {
      handles.scene.remove(group);
      handles.agentGroups.delete(id);
    }
  }
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
    const target = new THREE.Vector3(x, 0, z);
    const desired = new THREE.Vector3(x + 7, 10, z + 7);
    camera.position.lerp(desired, Math.min(delta * 2.5, 1));
    camera.lookAt(target);
    return;
  }
  camera.position.lerp(ISO_OFFSET, Math.min(delta * 2, 1));
  camera.lookAt(0, 0, 0);
}

export function renderScene(handles: OfficeSceneHandles) {
  handles.renderer.render(handles.scene, handles.camera);
}