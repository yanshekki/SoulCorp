import * as THREE from "three";
import { getCatalogEntry } from "../../data/furnitureCatalog";
import type { Agent, Building } from "../../types/world";
import type { AgentRecord } from "../../types/game";
import {
  DEFAULT_OFFICE_VISUAL,
  type FurnitureInstance,
  type InteriorZone,
  type OfficeVisualConfig,
} from "../../types/visualDesign";
import {
  applyOrbitToCamera,
  createGameInteriorOrbit,
  defaultInteriorFrustum,
  interiorSceneFocusZ,
} from "../../utils/interiorCamera";
import { snapPosition } from "../../utils/furnitureEditor";
import { normalizeOfficeVisual } from "../../utils/officeVisualNormalize";
import { createFurnitureObject, disposeFurnitureObject } from "./furnitureRenderer";
import { buildRoomShell, officeZoneOffset } from "./roomShellBuilder";
import {
  applyInteriorScenePolish,
  configureInteriorRenderer,
  interiorLightingPreset,
} from "../../utils/interiorPostPolish";
import { createInteriorPostPipeline, type InteriorPostPipeline } from "../../utils/interiorPostPipeline";
import { collectInteriorWalls, updateInteriorWallFade } from "../../utils/interiorWallFade";
import {
  createInteriorPixelAgent,
  updateInteriorPixelAgent,
  type InteriorPixelAgent,
} from "./interiorPixelAgent";
import { spawnParticleBurst } from "./particleBurst";
import {
  agentBillboardName,
  agentStatusBubble,
  createSkillProp,
  createStylizedAgent,
  type StylizedAgentMesh,
} from "./stylizedAgent";

interface InteriorAgentVisual {
  group: THREE.Group;
  pixel?: InteriorPixelAgent;
  mesh?: StylizedAgentMesh;
}

export interface InteriorVisualStyle {
  pixelAgents: boolean;
  cozyEffects: boolean;
  crtFilter: boolean;
  /** Design studio: crisp walls, no bloom/vignette haze. */
  clarityMode?: boolean;
}

export interface FloorHit {
  zone: InteriorZone;
  localPosition: [number, number, number];
  worldPosition: THREE.Vector3;
}

export interface FurnitureHit {
  furnitureId: string;
  catalogId: string;
  zone: InteriorZone;
  localPosition: [number, number, number];
}

interface ShellMeta {
  lobbyZ: number;
  corridorZ: number;
  officeZ: number;
  office: OfficeVisualConfig;
}

export interface InteriorSceneHandles {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  root: THREE.Group;
  agentMeshes: Map<string, InteriorAgentVisual>;
  furnitureObjects: THREE.Object3D[];
  exitDoor: THREE.Mesh | null;
  resize: (width: number, height: number) => void;
  rebuild: (
    building: Building,
    office: OfficeVisualConfig,
    agents: Agent[],
    records: AgentRecord[],
    companyName: string,
  ) => Promise<void>;
  raycastAgent: (normalizedX: number, normalizedY: number) => string | null;
  raycastDesk: (normalizedX: number, normalizedY: number) => number | null;
  raycastFurniture: (normalizedX: number, normalizedY: number) => FurnitureHit | null;
  raycastFloor: (normalizedX: number, normalizedY: number) => FloorHit | null;
  raycastExit: (normalizedX: number, normalizedY: number) => boolean;
  updateGhostPreview: (
    catalogId: string | null,
    zone: InteriorZone | null,
    localPosition: [number, number, number] | null,
    rotation?: number,
  ) => void;
  setFurnitureHighlight: (furnitureId: string | null) => void;
  setPlayFurnitureHover: (furnitureId: string | null) => void;
  setFocusZone: (zone: InteriorZone) => void;
  setVisualStyle: (style: Partial<InteriorVisualStyle>) => void;
  renderFrame: () => void;
  syncCamera: (
    office: OfficeVisualConfig,
    viewWidth: number,
    viewHeight: number,
    frustum?: number,
  ) => void;
  tick: (delta: number, agents: Agent[]) => void;
  dispose: () => void;
}

function lightingColor(lighting: OfficeVisualConfig["lighting"]): number {
  switch (lighting) {
    case "warm":
      return 0xffe8c8;
    case "cool":
      return 0xd8ecff;
    default:
      return 0xffffff;
  }
}

function zoneCenterZ(zone: InteriorZone, meta: ShellMeta): number {
  switch (zone) {
    case "lobby":
      return meta.lobbyZ;
    case "corridor":
      return meta.corridorZ;
    default:
      return meta.officeZ;
  }
}

function resolveZone(point: THREE.Vector3, meta: ShellMeta): InteriorZone | null {
  const { office, lobbyZ, corridorZ, officeZ } = meta;
  const z = point.z;
  if (z >= lobbyZ - office.lobby_room.depth / 2 && z <= lobbyZ + office.lobby_room.depth / 2) {
    return "lobby";
  }
  if (z >= corridorZ - office.corridor_room.depth / 2 && z <= corridorZ + office.corridor_room.depth / 2) {
    return "corridor";
  }
  if (z >= officeZ - office.room.depth / 2 && z <= officeZ + office.room.depth / 2) {
    return "office";
  }
  return null;
}

function localFromWorld(point: THREE.Vector3, zone: InteriorZone, meta: ShellMeta): [number, number, number] {
  const centerZ = zoneCenterZ(zone, meta);
  const [x, z] = snapPosition(point.x, point.z - centerZ);
  return [x, 0, z];
}

function worldFromLocal(
  local: [number, number, number],
  zone: InteriorZone,
  meta: ShellMeta,
): THREE.Vector3 {
  const centerZ = zoneCenterZ(zone, meta);
  return new THREE.Vector3(local[0], local[1], local[2] + centerZ);
}

function furnitureIdForObject(object: THREE.Object3D): string | null {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (node.userData.furnitureId) {
      return node.userData.furnitureId as string;
    }
    node = node.parent;
  }
  return null;
}

function zoneOffset(
  item: FurnitureInstance,
  shell: ReturnType<typeof buildRoomShell>,
  officeZ: number,
): [number, number, number] {
  const [x, y, z] = item.position;
  if (item.zone === "office") {
    return [x, y, z + officeZ];
  }
  if (item.zone === "lobby") {
    return [x, y, z + (shell.group.userData.lobbyZ as number)];
  }
  return [x, y, z];
}

export function createInteriorScene(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): InteriorSceneHandles {
  const scene = new THREE.Scene();
  applyInteriorScenePolish(scene, DEFAULT_OFFICE_VISUAL);

  const aspect = width / Math.max(height, 1);
  let cameraFrustum = defaultInteriorFrustum(DEFAULT_OFFICE_VISUAL, "office");
  const applyCameraFrustum = (nextAspect: number) => {
    camera.left = (-cameraFrustum * nextAspect) / 2;
    camera.right = (cameraFrustum * nextAspect) / 2;
    camera.top = cameraFrustum / 2;
    camera.bottom = -cameraFrustum / 2;
    camera.updateProjectionMatrix();
  };
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  applyCameraFrustum(aspect);
  camera.position.set(5.5, 7, 5.5);
  camera.lookAt(0, 0.75, 0);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  configureInteriorRenderer(renderer);

  const root = new THREE.Group();
  scene.add(root);

  const ambient = new THREE.AmbientLight(0xffffff, 0.68);
  const key = new THREE.DirectionalLight(0xfff4e0, 1.1);
  key.position.set(6, 14, 8);
  key.castShadow = true;
  const hemisphere = new THREE.HemisphereLight(0xf4f8ff, 0xb8a88a, 0.42);
  scene.add(ambient, key, hemisphere);

  const agentMeshes = new Map<string, InteriorAgentVisual>();
  let visualStyle: InteriorVisualStyle = {
    pixelAgents: false,
    cozyEffects: true,
    crtFilter: false,
    clarityMode: false,
  };
  let lastRebuildContext: {
    building: Building;
    office: OfficeVisualConfig;
    agents: Agent[];
    records: AgentRecord[];
    companyName: string;
  } | null = null;
  let postPipeline: InteriorPostPipeline | null = createInteriorPostPipeline(
    renderer,
    scene,
    camera,
    width,
    height,
  );
  postPipeline.setCrtEnabled(visualStyle.crtFilter && visualStyle.cozyEffects);
  const furnitureObjects: THREE.Object3D[] = [];
  const zoneLights: THREE.PointLight[] = [];
  let interiorWalls: THREE.Mesh[] = [];
  let focusZone: InteriorZone = "office";
  let exitDoor: THREE.Mesh | null = null;
  let shellMeta: ShellMeta | null = null;
  let ghostObject: THREE.Mesh | null = null;
  const focusPoint = new THREE.Vector3(0, 0.75, 0);

  let rebuildGeneration = 0;
  const raycaster = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const disposeObject = (object: THREE.Object3D) => {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const mat = child.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else {
          mat.dispose();
        }
      }
    });
  };

  const clearGhost = () => {
    if (ghostObject) {
      root.remove(ghostObject);
      ghostObject.geometry.dispose();
      (ghostObject.material as THREE.Material).dispose();
      ghostObject = null;
    }
  };

  const clearFurniture = () => {
    for (const object of furnitureObjects) {
      root.remove(object);
      disposeFurnitureObject(object);
    }
    furnitureObjects.length = 0;
    clearGhost();
  };

  const clearRoot = () => {
    rebuildGeneration += 1;
    clearFurniture();
    for (const entry of agentMeshes.values()) {
      root.remove(entry.group);
      disposeObject(entry.group);
      entry.pixel?.textureCache.forEach((texture) => texture.dispose());
    }
    agentMeshes.clear();
    while (root.children.length > 0) {
      const child = root.children[0];
      root.remove(child);
      disposeObject(child);
    }
    exitDoor = null;
    interiorWalls = [];
  };

  const syncCameraToOffice = (office: OfficeVisualConfig) => {
    const orbit = createGameInteriorOrbit(office);
    cameraFrustum = orbit.frustum / orbit.zoom;
    applyCameraFrustum(width / Math.max(height, 1));
    applyOrbitToCamera(camera, orbit, interiorSceneFocusZ());
  };

  const rebuild = async (
    building: Building,
    rawOffice: OfficeVisualConfig,
    agents: Agent[],
    records: AgentRecord[],
    companyName: string,
  ) => {
    clearRoot();
    const generation = rebuildGeneration;
    const office = normalizeOfficeVisual(rawOffice, building.id);
    applyInteriorScenePolish(scene, office);
    const lighting = interiorLightingPreset(office.lighting);
    ambient.intensity = lighting.ambientIntensity;
    ambient.color.setHex(lighting.hemisphereSky);
    key.intensity = lighting.keyIntensity;
    key.color.setHex(lighting.keyColor);
    hemisphere.color.setHex(lighting.hemisphereSky);
    hemisphere.groundColor.setHex(lighting.hemisphereGround);
    hemisphere.intensity = 0.42;

    const shell = buildRoomShell(office);
    root.add(shell.group);
    exitDoor = shell.exitDoor;
    interiorWalls = collectInteriorWalls(shell.group);

    const officeZ = officeZoneOffset(shell);
    const lobbyZ = shell.group.userData.lobbyZ as number;
    const corridorZ = lobbyZ - office.lobby_room.depth / 2 - office.corridor_room.depth / 2;
    shellMeta = { lobbyZ, corridorZ, officeZ, office };
    focusPoint.set(0, 0.75, zoneCenterZ(focusZone, shellMeta));

    syncCameraToOffice(office);

    const logo = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(2.2, office.lobby_room.width * 0.38), 0.65, 0.08),
      new THREE.MeshStandardMaterial({
        color: office.accent_color,
        emissive: office.accent_color,
        emissiveIntensity: 0.12,
        roughness: 0.4,
      }),
    );
    logo.position.set(0, 1.5, shell.group.userData.lobbyZ as number);
    root.add(logo);

    for (const light of zoneLights) {
      root.remove(light);
      light.dispose();
    }
    zoneLights.length = 0;
    const zoneDefs: Array<{ zone: InteriorZone; z: number; height: number }> = [
      { zone: "lobby", z: lobbyZ, height: office.lobby_room.height },
      { zone: "corridor", z: corridorZ, height: office.corridor_room.height },
      { zone: "office", z: officeZ, height: office.room.height },
    ];
    for (const entry of zoneDefs) {
      const point = new THREE.PointLight(lightingColor(office.lighting), lighting.zoneLightIntensity, 18);
      point.position.set(0, entry.height - 0.35, entry.z);
      root.add(point);
      zoneLights.push(point);
    }

    const deskIndexById = new Map<string, number>();
    let deskIndex = 0;
    for (const item of office.furniture) {
      if (item.catalog_id.startsWith("desk_")) {
        deskIndexById.set(item.id, deskIndex);
        deskIndex += 1;
      }
    }

    const placements = await Promise.all(
      office.furniture.map(async (item) => {
        const entry = getCatalogEntry(item.catalog_id);
        if (!entry) {
          return null;
        }
        const [x, y, z] = zoneOffset(item, shell, officeZ);
        const object = await createFurnitureObject(
          { ...item, position: [x, y, z] },
          entry,
          office.accent_color,
        );
        const indexedDesk = deskIndexById.get(item.id);
        if (indexedDesk !== undefined) {
          object.userData.deskIndex = indexedDesk;
        }
        return object;
      }),
    );

    if (generation !== rebuildGeneration) {
      placements.forEach((object) => {
        if (object) {
          disposeFurnitureObject(object);
        }
      });
      return;
    }

    for (const object of placements) {
      if (!object) {
        continue;
      }
      furnitureObjects.push(object);
      root.add(object);
    }

    const deptAgents = agents.filter((agent) => {
      const record = records.find((r) => r.id === agent.id);
      return record && building.department === record.department;
    });

    const deskFurniture = office.furniture.filter((f) => f.catalog_id.startsWith("desk_"));

    deptAgents.forEach((agent, index) => {
      const desk = deskFurniture[index % deskFurniture.length];
      const interiorPos: [number, number, number] = desk
        ? [desk.position[0], 0, desk.position[2] + officeZ]
        : [0, 0, officeZ];

      let visual: InteriorAgentVisual;
      if (visualStyle.pixelAgents) {
        const pixel = createInteriorPixelAgent(agent);
        pixel.group.position.set(interiorPos[0], interiorPos[1], interiorPos[2]);
        pixel.group.userData.baseY = interiorPos[1];
        visual = { group: pixel.group, pixel };
        root.add(pixel.group);
      } else {
        const mesh = createStylizedAgent(agent, true);
        mesh.group.position.set(interiorPos[0], interiorPos[1], interiorPos[2]);
        mesh.group.userData.baseY = interiorPos[1];
        mesh.group.rotation.y = Math.PI;
        mesh.group.add(agentBillboardName(agent));
        mesh.group.add(agentStatusBubble(agent));
        const record = records.find((r) => r.id === agent.id);
        const skills = record?.skills ?? [];
        skills.slice(0, 2).forEach((skill, skillIndex) => {
          const prop = createSkillProp(skill);
          prop.position.set(-0.3 + skillIndex * 0.35, 0.48, 0.2);
          mesh.group.add(prop);
        });
        visual = { group: mesh.group, mesh };
        root.add(mesh.group);
      }

      agentMeshes.set(agent.id, visual);
    });

    const sign = createCompanySign(companyName || building.name);
    sign.position.set(0, office.room.height - 0.5, officeZ - office.room.depth / 2 + 0.2);
    root.add(sign);

    lastRebuildContext = { building, office: rawOffice, agents, records, companyName };
  };

  return {
    scene,
    camera,
    renderer,
    root,
    agentMeshes,
    furnitureObjects,
    exitDoor,
    resize(nextWidth, nextHeight) {
      applyCameraFrustum(nextWidth / Math.max(nextHeight, 1));
      renderer.setSize(nextWidth, nextHeight, false);
      postPipeline?.resize(nextWidth, nextHeight);
    },
    rebuild,
    raycastAgent(nx, ny) {
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const groups = Array.from(agentMeshes.values()).map((entry) => entry.group);
      const hits = raycaster.intersectObjects(groups, true);
      for (const hit of hits) {
        let node: THREE.Object3D | null = hit.object;
        while (node) {
          if (node.userData.agentId) {
            return node.userData.agentId as string;
          }
          node = node.parent;
        }
      }
      return null;
    },
    raycastDesk(nx, ny) {
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const desks = furnitureObjects.filter((object) => object.userData.isDesk === true);
      const hits = raycaster.intersectObjects(desks, true);
      if (hits.length === 0) {
        return null;
      }
      let node: THREE.Object3D | null = hits[0].object;
      while (node) {
        if (node.userData.deskIndex !== undefined) {
          return node.userData.deskIndex as number;
        }
        node = node.parent;
      }
      return null;
    },
    raycastFurniture(nx, ny) {
      if (!shellMeta) {
        return null;
      }
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const hits = raycaster.intersectObjects(furnitureObjects, true);
      if (hits.length === 0) {
        return null;
      }
      const furnitureId = furnitureIdForObject(hits[0].object);
      if (!furnitureId) {
        return null;
      }
      const item = shellMeta.office.furniture.find((entry) => entry.id === furnitureId);
      if (!item) {
        return null;
      }
      return {
        furnitureId,
        catalogId: item.catalog_id,
        zone: item.zone,
        localPosition: [...item.position] as [number, number, number],
      };
    },
    raycastFloor(nx, ny) {
      if (!shellMeta) {
        return null;
      }
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(floorPlane, hit)) {
        return null;
      }
      const zone = resolveZone(hit, shellMeta);
      if (!zone) {
        return null;
      }
      return {
        zone,
        localPosition: localFromWorld(hit, zone, shellMeta),
        worldPosition: hit.clone(),
      };
    },
    raycastExit(nx, ny) {
      if (!exitDoor) {
        return false;
      }
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const hits = raycaster.intersectObject(exitDoor, false);
      return hits.length > 0;
    },
    updateGhostPreview(catalogId, zone, localPosition, rotation = 0) {
      clearGhost();
      if (!catalogId || !zone || !localPosition || !shellMeta) {
        return;
      }
      const entry = getCatalogEntry(catalogId);
      if (!entry) {
        return;
      }
      const [w, d] = entry.footprint;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.6, d),
        new THREE.MeshStandardMaterial({
          color: shellMeta.office.accent_color,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        }),
      );
      const world = worldFromLocal(localPosition, zone, shellMeta);
      mesh.position.copy(world);
      mesh.position.y = 0.3;
      mesh.rotation.y = rotation;
      mesh.userData.isGhost = true;
      ghostObject = mesh;
      root.add(mesh);
    },
    setFurnitureHighlight(furnitureId) {
      furnitureObjects.forEach((object) => {
        const id = object.userData.furnitureId as string | undefined;
        const selected = id === furnitureId;
        object.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) {
            return;
          }
          const mat = child.material;
          if (!(mat instanceof THREE.MeshStandardMaterial)) {
            return;
          }
          if (selected) {
            mat.emissive.set("#5ec8ff");
            mat.emissiveIntensity = 0.3;
          } else if (!object.userData.playHover) {
            mat.emissive.set("#000000");
            mat.emissiveIntensity = object.userData.isTech ? 0.05 : 0;
          }
        });
      });
    },
    setPlayFurnitureHover(furnitureId) {
      furnitureObjects.forEach((object) => {
        const id = object.userData.furnitureId as string | undefined;
        object.userData.playHover = id === furnitureId;
        if (object.userData.isTech) {
          return;
        }
        object.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) {
            return;
          }
          const mat = child.material;
          if (!(mat instanceof THREE.MeshStandardMaterial)) {
            return;
          }
          if (id === furnitureId) {
            mat.emissive.set("#ffe08a");
            mat.emissiveIntensity = 0.18;
          } else if (!object.userData.isTech) {
            mat.emissive.set("#000000");
            mat.emissiveIntensity = 0;
          }
        });
      });
    },
    setFocusZone(zone) {
      focusZone = zone;
      if (shellMeta) {
        focusPoint.set(0, 0.75, zoneCenterZ(zone, shellMeta));
      }
    },
    setVisualStyle(style) {
      const nextPixel = style.pixelAgents ?? visualStyle.pixelAgents;
      const nextClarity = style.clarityMode ?? visualStyle.clarityMode ?? false;
      const nextCozy = nextClarity ? false : (style.cozyEffects ?? visualStyle.cozyEffects);
      const nextCrt = nextClarity ? false : (style.crtFilter ?? visualStyle.crtFilter);
      const pixelChanged = nextPixel !== visualStyle.pixelAgents;
      visualStyle = {
        pixelAgents: nextPixel,
        cozyEffects: nextCozy,
        crtFilter: nextCrt,
        clarityMode: nextClarity,
      };
      postPipeline?.setEnabled(nextCozy);
      postPipeline?.setCrtEnabled(nextCrt && nextCozy);
      if (nextClarity) {
        for (const wall of interiorWalls) {
          const material = wall.material;
          if (material instanceof THREE.MeshStandardMaterial) {
            material.opacity = 1;
            material.transparent = false;
            material.depthWrite = true;
          }
        }
      }
      if (pixelChanged && lastRebuildContext) {
        const ctx = lastRebuildContext;
        void rebuild(ctx.building, ctx.office, ctx.agents, ctx.records, ctx.companyName);
      }
    },
    renderFrame() {
      postPipeline?.render();
    },
    syncCamera(office, viewWidth, viewHeight, frustum) {
      if (frustum !== undefined) {
        cameraFrustum = frustum;
      } else {
        const orbit = createGameInteriorOrbit(office);
        cameraFrustum = orbit.frustum / orbit.zoom;
      }
      applyCameraFrustum(viewWidth / Math.max(viewHeight, 1));
    },
    tick(_delta, agents) {
      const phase = performance.now() * 0.004;
      const working = agents.filter((agent) => agent.status === "working");
      const worldPos = new THREE.Vector3();

      if (!visualStyle.clarityMode && shellMeta && interiorWalls.length > 0) {
        const viewDir = new THREE.Vector3();
        camera.getWorldDirection(viewDir);
        const wallFocus = camera.position.clone().add(viewDir.multiplyScalar(8));
        updateInteriorWallFade(interiorWalls, camera, wallFocus);
      }

      furnitureObjects.forEach((object) => {
        const isTech = object.userData.isTech === true;
        const isLighting = object.userData.catalogId === "floor_lamp";
        if (!isTech && !isLighting) {
          return;
        }
        object.getWorldPosition(worldPos);
        const nearWorker = working.some((agent) => {
          const dx = agent.position[0] - worldPos.x;
          const dz = agent.position[2] - worldPos.z;
          return Math.hypot(dx, dz) < 2.5;
        });
        const pulse = nearWorker
          ? 0.14 + Math.sin(phase) * 0.16
          : 0.07 + Math.sin(phase * 0.8) * 0.05;
        object.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) {
            return;
          }
          const mat = child.material;
          if (!(mat instanceof THREE.MeshStandardMaterial)) {
            return;
          }
          const name = child.name.toLowerCase();
          if (name.includes("screen") || name.includes("accent") || isTech || isLighting) {
            if (mat.emissive.r + mat.emissive.g + mat.emissive.b < 0.05) {
              mat.emissive.set("#5ec8ff");
            }
            mat.emissiveIntensity = pulse;
          }
        });
      });

      const now = performance.now();
      agentMeshes.forEach((visual, agentId) => {
        const agent = agents.find((entry) => entry.id === agentId);
        const baseY = (visual.group.userData.baseY as number | undefined) ?? visual.group.position.y;
        if (!agent) {
          visual.group.position.y = baseY;
          return;
        }

        if (visual.pixel) {
          updateInteriorPixelAgent(visual.pixel, agent, phase * 1.6);
        }

        const bob =
          agent.status === "working"
            ? Math.sin(phase * 2.2) * 0.03
            : Math.sin(phase * 1.5) * 0.018;
        visual.group.position.y = baseY + bob;

        if (agent.status === "working") {
          const lastBurst = (visual.group.userData.lastBurstAt as number | undefined) ?? 0;
          if (now - lastBurst > 2400) {
            const burstColor = agent.department === "Engineering" ? "#9be7ff" : "#ffd98a";
            spawnParticleBurst(scene, visual.group.position, burstColor, 5);
            visual.group.userData.lastBurstAt = now;
          }
        }
      });
    },
    dispose() {
      clearRoot();
      postPipeline?.dispose();
      postPipeline = null;
      renderer.dispose();
      scene.clear();
    },
  };
}

function createCompanySign(name: string): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#1a2744";
    ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = "#f4f8ff";
    ctx.font = "bold 32px system-ui";
    ctx.fillText(name, 24, 58);
  }
  const texture = new THREE.CanvasTexture(canvas);
  return new THREE.Mesh(
    new THREE.PlaneGeometry(3.5, 0.65),
    new THREE.MeshStandardMaterial({ map: texture }),
  );
}