import * as THREE from "three";
import { agentActivityRuntimeRef } from "../../stores/agentActivityStore";
import type { Agent } from "../../types/world";
import {
  getAgentPixelTexture,
  getDepartmentPixelTexture,
  walkFrameIndex,
} from "./pixelAgentSprite";
import { applyStylizedAgentAnimation } from "./stylizedAgentAnimation";
import { createStylizedAgent, type StylizedAgentMesh } from "./stylizedAgent";

const MAX_FAR_AGENTS = 512;
const MAX_BILLBOARD_AGENTS = 384;
const MAX_HERO_AGENTS = 16;
const MAX_CLOSE_PIXEL_SPRITES = 24;
const MAX_STATUS_BUBBLES = 24;
const FAR_DISTANCE = 18;
const CLOSE_DISTANCE = 10;
const STATUS_DISTANCE = 16;

const tempObject = new THREE.Object3D();
const cameraPosition = new THREE.Vector3();
const agentPosition = new THREE.Vector3();
const billboardMatrix = new THREE.Matrix4();

interface LodBucket {
  far: Agent[];
  medium: Map<string, Agent[]>;
  close: Agent[];
}

function classifyAgents(
  agents: Agent[],
  camera: THREE.Camera,
  lowPowerMode: boolean,
): LodBucket {
  camera.getWorldPosition(cameraPosition);
  const farDistance = lowPowerMode ? 14 : FAR_DISTANCE;
  const bucket: LodBucket = { far: [], medium: new Map(), close: [] };

  for (const agent of agents) {
    agentPosition.set(agent.position[0], agent.position[1], agent.position[2]);
    const distance = cameraPosition.distanceTo(agentPosition);
    if (distance > farDistance) {
      bucket.far.push(agent);
      continue;
    }
    if (distance <= CLOSE_DISTANCE) {
      bucket.close.push(agent);
      continue;
    }
    const list = bucket.medium.get(agent.department) ?? [];
    list.push(agent);
    bucket.medium.set(agent.department, list);
  }

  return bucket;
}

function agentBob(agent: Agent): number {
  if (agent.status !== "walking") {
    return 0;
  }
  return Math.abs(Math.sin(agent.walkPhase)) * 0.05;
}

function sortAgentsByDistance(agents: Agent[], camera: THREE.Camera, farthestFirst = false): Agent[] {
  camera.getWorldPosition(cameraPosition);
  return [...agents].sort((a, b) => {
    agentPosition.set(a.position[0], a.position[1], a.position[2]);
    const distA = cameraPosition.distanceTo(agentPosition);
    agentPosition.set(b.position[0], b.position[1], b.position[2]);
    const distB = cameraPosition.distanceTo(agentPosition);
    return farthestFirst ? distB - distA : distA - distB;
  });
}

function agentBillboardMatrix(agent: Agent, scale: number): THREE.Matrix4 {
  const bob = agentBob(agent);
  tempObject.position.set(agent.position[0], agent.position[1] + bob + 0.55, agent.position[2]);
  tempObject.rotation.set(
    0,
    Math.atan2(cameraPosition.x - agent.position[0], cameraPosition.z - agent.position[2]),
    0,
  );
  tempObject.scale.set(scale, scale * 1.25, scale);
  tempObject.updateMatrix();
  return billboardMatrix.copy(tempObject.matrix);
}

function createStatusBubble(label: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(18, 32, 24, 0.82)";
    const text = label.length > 28 ? `${label.slice(0, 25)}...` : label;
    ctx.font = "bold 18px sans-serif";
    const width = Math.min(240, ctx.measureText(text).width + 24);
    const x = (canvas.width - width) / 2;
    roundRect(ctx, x, 10, width, 34, 10);
    ctx.fill();
    ctx.fillStyle = "#f8fff4";
    ctx.fillText(text, x + 12, 33);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.8, 0.45, 1);
  sprite.position.y = 2.15;
  sprite.renderOrder = 10;
  return sprite;
}

function updateStatusBubble(sprite: THREE.Sprite, label: string) {
  const currentLabel = (sprite.userData.statusLabel as string | undefined) ?? "";
  if (currentLabel === label) {
    return;
  }
  sprite.userData.statusLabel = label;

  const canvas = (sprite.material as THREE.SpriteMaterial).map?.image as HTMLCanvasElement;
  const ctx = canvas?.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(18, 32, 24, 0.82)";
  const text = label.length > 28 ? `${label.slice(0, 25)}...` : label;
  ctx.font = "bold 18px sans-serif";
  const width = Math.min(240, ctx.measureText(text).width + 24);
  const x = (canvas.width - width) / 2;
  roundRect(ctx, x, 10, width, 34, 10);
  ctx.fill();
  ctx.fillStyle = "#f8fff4";
  ctx.fillText(text, x + 12, 33);
  (sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true;
}

function hashOffset(id: string): number {
  let hash = 0;
  for (const char of id) {
    hash = (hash + char.charCodeAt(0) * 13) % 97;
  }
  return hash * 0.03;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export class AgentRenderSystem {
  private readonly scene: THREE.Scene;
  private readonly farMesh: THREE.InstancedMesh;
  private readonly mediumBoxMesh: THREE.InstancedMesh;
  private readonly deptMeshes = new Map<string, THREE.InstancedMesh>();
  private readonly closeSprites = new Map<string, THREE.Sprite>();
  private readonly closeMeshes = new Map<string, StylizedAgentMesh>();
  private readonly statusSprites = new Map<string, THREE.Sprite>();
  private readonly workEffectSprites = new Map<string, THREE.Sprite>();
  private readonly textureCache = new Map<string, THREE.CanvasTexture>();
  private readonly tempColor = new THREE.Color();
  private effectPhase = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const farGeometry = new THREE.BoxGeometry(0.28, 0.5, 0.28);
    const farMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
    });
    this.farMesh = new THREE.InstancedMesh(farGeometry, farMaterial, MAX_FAR_AGENTS);
    this.farMesh.count = 0;
    scene.add(this.farMesh);

    const mediumGeometry = new THREE.BoxGeometry(0.34, 0.58, 0.34);
    const mediumMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
    });
    this.mediumBoxMesh = new THREE.InstancedMesh(mediumGeometry, mediumMaterial, MAX_BILLBOARD_AGENTS);
    this.mediumBoxMesh.count = 0;
    scene.add(this.mediumBoxMesh);
  }

  sync(
    agents: Agent[],
    camera: THREE.Camera,
    lowPowerMode: boolean,
    pixelFilterEnabled = false,
  ) {
    camera.getWorldPosition(cameraPosition);
    const bucket = classifyAgents(agents, camera, lowPowerMode);
    const seen = new Set(agents.map((agent) => agent.id));

    this.syncFarAgents(sortAgentsByDistance(bucket.far, camera, true));
    this.syncMediumAgents([...bucket.medium.values()].flat(), camera, pixelFilterEnabled);
    this.syncCloseAgents(sortAgentsByDistance(bucket.close, camera), pixelFilterEnabled);
    this.syncStatusSprites(agents, camera, lowPowerMode, seen);
    if (!lowPowerMode) {
      this.syncWorkEffectSprites(bucket.close, seen);
    }

    for (const [id, sprite] of this.closeSprites) {
      if (!seen.has(id)) {
        this.scene.remove(sprite);
        this.closeSprites.delete(id);
      }
    }
    for (const [id, mesh] of this.closeMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh.group);
        this.disposeStylizedAgent(mesh);
        this.closeMeshes.delete(id);
      }
    }
    for (const [id, sprite] of this.statusSprites) {
      if (!seen.has(id)) {
        this.scene.remove(sprite);
        this.statusSprites.delete(id);
      }
    }
    for (const [id, sprite] of this.workEffectSprites) {
      if (!seen.has(id)) {
        this.scene.remove(sprite);
        this.workEffectSprites.delete(id);
      }
    }
  }

  private syncWorkEffectSprites(agents: Agent[], seen: Set<string>) {
    this.effectPhase += 0.08;
    const working = agents.filter(
      (agent) =>
        (agent.status === "working" && agent.behavior.intent === "working")
        || agentActivityRuntimeRef.activeAgentIds.has(agent.id),
    );

    for (const agent of working) {
      let sprite = this.workEffectSprites.get(agent.id);
      if (!sprite) {
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#9be7ff";
          ctx.fillRect(4, 4, 8, 8);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity: 0.85,
          depthTest: false,
        });
        sprite = new THREE.Sprite(material);
        sprite.scale.set(0.22, 0.22, 0.22);
        sprite.renderOrder = 6;
        this.workEffectSprites.set(agent.id, sprite);
        this.scene.add(sprite);
      }
      const bob = Math.sin(this.effectPhase + hashOffset(agent.id)) * 0.12;
      sprite.position.set(
        agent.position[0] + 0.35,
        agent.position[1] + 1.35 + bob,
        agent.position[2],
      );
    }

    for (const [id, sprite] of this.workEffectSprites) {
      if (!working.some((agent) => agent.id === id) || !seen.has(id)) {
        this.scene.remove(sprite);
        this.workEffectSprites.delete(id);
      }
    }
  }

  private syncBillboardBatches(
    agents: Agent[],
    pixelFilterEnabled: boolean,
    scale: number,
    prefix: string,
  ) {
    const groups = new Map<string, Agent[]>();
    for (const agent of agents.slice(0, MAX_BILLBOARD_AGENTS)) {
      const frame = walkFrameIndex(agent.walkPhase, agent.status === "walking");
      const key = pixelFilterEnabled
        ? `${prefix}:${agent.department}:${frame}`
        : `${prefix}:${agent.department}`;
      const list = groups.get(key) ?? [];
      list.push(agent);
      groups.set(key, list);
    }

    const activeKeys = new Set<string>();
    for (const [key, batchAgents] of groups) {
      activeKeys.add(key);
      let mesh = this.deptMeshes.get(key);
      if (!mesh) {
        const geometry = new THREE.PlaneGeometry(0.9, 1.2);
        const material = pixelFilterEnabled
          ? new THREE.MeshStandardMaterial({
              map: getDepartmentPixelTexture(
                this.textureCache,
                key.split(":")[1] ?? "Engineering",
              ),
              transparent: true,
              alphaTest: 0.4,
              side: THREE.DoubleSide,
              toneMapped: false,
            })
          : new THREE.MeshStandardMaterial({
              color: "#79a86f",
              transparent: true,
              opacity: 0.92,
              side: THREE.DoubleSide,
            });
        mesh = new THREE.InstancedMesh(geometry, material, MAX_BILLBOARD_AGENTS);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.deptMeshes.set(key, mesh);
        this.scene.add(mesh);
      }

      mesh.count = batchAgents.length;
      batchAgents.forEach((agent, index) => {
        mesh!.setMatrixAt(index, agentBillboardMatrix(agent, scale));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }

    for (const [key, mesh] of this.deptMeshes) {
      if (!key.startsWith(`${prefix}:`) || !activeKeys.has(key)) {
        mesh.count = 0;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  private syncFarAgents(agents: Agent[]) {
    const batch = agents.slice(0, MAX_FAR_AGENTS);
    this.farMesh.count = batch.length;
    batch.forEach((agent, index) => {
      const bob = agentBob(agent);
      tempObject.position.set(agent.position[0], agent.position[1] + bob + 0.25, agent.position[2]);
      tempObject.rotation.set(0, Math.atan2(
        agent.target[0] - agent.position[0],
        agent.target[2] - agent.position[2],
      ), 0);
      tempObject.scale.setScalar(1);
      tempObject.updateMatrix();
      this.farMesh.setMatrixAt(index, tempObject.matrix);
      this.farMesh.setColorAt(index, this.tempColor.set(agent.color));
    });
    this.farMesh.instanceMatrix.needsUpdate = true;
    if (this.farMesh.instanceColor) {
      this.farMesh.instanceColor.needsUpdate = true;
    }
  }

  private disposeStylizedAgent(mesh: StylizedAgentMesh) {
    mesh.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const mat = child.material;
        if (Array.isArray(mat)) {
          mat.forEach((entry) => entry.dispose());
        } else {
          mat.dispose();
        }
      }
    });
  }

  private syncMediumAgents(agents: Agent[], camera: THREE.Camera, pixelFilterEnabled: boolean) {
    if (pixelFilterEnabled) {
      this.mediumBoxMesh.count = 0;
      this.mediumBoxMesh.instanceMatrix.needsUpdate = true;
      this.syncBillboardBatches(agents, true, 0.92, "medium");
      return;
    }

    for (const [key, mesh] of this.deptMeshes) {
      if (key.startsWith("medium:")) {
        mesh.count = 0;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }

    const sorted = sortAgentsByDistance(agents, camera);
    const heroes = sorted.slice(0, MAX_HERO_AGENTS);
    const overflow = sorted.slice(MAX_HERO_AGENTS, MAX_BILLBOARD_AGENTS);

    this.mediumBoxMesh.count = overflow.length;
    overflow.forEach((agent, index) => {
      const bob = agentBob(agent);
      tempObject.position.set(agent.position[0], agent.position[1] + bob + 0.28, agent.position[2]);
      tempObject.rotation.set(
        0,
        Math.atan2(agent.target[0] - agent.position[0], agent.target[2] - agent.position[2]),
        0,
      );
      tempObject.scale.setScalar(0.9);
      tempObject.updateMatrix();
      this.mediumBoxMesh.setMatrixAt(index, tempObject.matrix);
      this.mediumBoxMesh.setColorAt(index, this.tempColor.set(agent.color));
    });
    this.mediumBoxMesh.instanceMatrix.needsUpdate = true;
    if (this.mediumBoxMesh.instanceColor) {
      this.mediumBoxMesh.instanceColor.needsUpdate = true;
    }

    const activeHeroes = new Set(heroes.map((agent) => agent.id));
    for (const agent of heroes) {
      const bob = agentBob(agent);
      let mesh = this.closeMeshes.get(`medium:${agent.id}`);
      if (!mesh) {
        mesh = createStylizedAgent(agent, false);
        mesh.group.scale.setScalar(0.82);
        this.closeMeshes.set(`medium:${agent.id}`, mesh);
        this.scene.add(mesh.group);
      }
      mesh.group.position.set(agent.position[0], agent.position[1] + bob, agent.position[2]);
      mesh.group.rotation.y = Math.atan2(
        agent.target[0] - agent.position[0],
        agent.target[2] - agent.position[2],
      );
    }

    for (const [id, mesh] of this.closeMeshes) {
      if (!id.startsWith("medium:")) {
        continue;
      }
      const agentId = id.slice("medium:".length);
      if (!activeHeroes.has(agentId)) {
        this.scene.remove(mesh.group);
        this.disposeStylizedAgent(mesh);
        this.closeMeshes.delete(id);
      }
    }
  }

  private syncCloseAgents(agents: Agent[], pixelFilterEnabled: boolean) {
    const heroes = agents.slice(0, MAX_HERO_AGENTS);
    const spriteHeroes = agents.slice(0, MAX_CLOSE_PIXEL_SPRITES);
    const overflow = agents.slice(pixelFilterEnabled ? MAX_CLOSE_PIXEL_SPRITES : MAX_HERO_AGENTS);

    if (pixelFilterEnabled) {
      this.syncBillboardBatches(overflow, true, 1.0, "close");
    } else {
      for (const [key, mesh] of this.deptMeshes) {
        if (key.startsWith("close:")) {
          mesh.count = 0;
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }

    const activeHeroes = new Set(heroes.map((agent) => agent.id));
    const activeSprites = new Set(spriteHeroes.map((agent) => agent.id));

    for (const agent of spriteHeroes) {
      const bob = agentBob(agent);
      if (pixelFilterEnabled) {
        const existingMesh = this.closeMeshes.get(agent.id);
        if (existingMesh) {
          this.scene.remove(existingMesh.group);
          this.disposeStylizedAgent(existingMesh);
          this.closeMeshes.delete(agent.id);
        }

        const frame = walkFrameIndex(agent.walkPhase, agent.status === "walking");
        let sprite = this.closeSprites.get(agent.id);
        if (!sprite) {
          const material = new THREE.SpriteMaterial({
            map: getAgentPixelTexture(this.textureCache, agent, frame),
            transparent: true,
            depthTest: true,
            toneMapped: false,
          });
          sprite = new THREE.Sprite(material);
          sprite.renderOrder = 5;
          this.closeSprites.set(agent.id, sprite);
          this.scene.add(sprite);
        } else {
          const material = sprite.material as THREE.SpriteMaterial;
          material.map = getAgentPixelTexture(this.textureCache, agent, frame);
          material.needsUpdate = true;
        }
        sprite.position.set(agent.position[0], agent.position[1] + bob + 0.75, agent.position[2]);
        sprite.scale.set(1.15, 1.45, 1);
        sprite.material.rotation = 0;
        continue;
      }

      const existingSprite = this.closeSprites.get(agent.id);
      if (existingSprite) {
        this.scene.remove(existingSprite);
        this.closeSprites.delete(agent.id);
      }
    }

    for (const agent of heroes) {
      if (pixelFilterEnabled) {
        continue;
      }
      const bob = agentBob(agent);
      let mesh = this.closeMeshes.get(agent.id);
      if (!mesh) {
        mesh = createStylizedAgent(agent, false);
        this.closeMeshes.set(agent.id, mesh);
        this.scene.add(mesh.group);
      }
      mesh.group.position.set(agent.position[0], agent.position[1] + bob, agent.position[2]);
      mesh.group.rotation.y = Math.atan2(
        agent.target[0] - agent.position[0],
        agent.target[2] - agent.position[2],
      );
      applyStylizedAgentAnimation(mesh, agent, this.effectPhase + hashOffset(agent.id), false);
    }

    for (const [id, sprite] of this.closeSprites) {
      if (!activeSprites.has(id)) {
        this.scene.remove(sprite);
        this.closeSprites.delete(id);
      }
    }
    for (const [id, mesh] of this.closeMeshes) {
      if (id.startsWith("medium:")) {
        continue;
      }
      if (!activeHeroes.has(id)) {
        this.scene.remove(mesh.group);
        this.disposeStylizedAgent(mesh);
        this.closeMeshes.delete(id);
      }
    }
  }

  private syncStatusSprites(
    agents: Agent[],
    camera: THREE.Camera,
    lowPowerMode: boolean,
    seen: Set<string>,
  ) {
    camera.getWorldPosition(cameraPosition);
    const statusDistance = lowPowerMode ? 12 : STATUS_DISTANCE;
    const statusAgents = sortAgentsByDistance(agents, camera).slice(0, MAX_STATUS_BUBBLES);

    for (const agent of statusAgents) {
      agentPosition.set(agent.position[0], agent.position[1], agent.position[2]);
      const distance = cameraPosition.distanceTo(agentPosition);
      if (distance > statusDistance) {
        const existing = this.statusSprites.get(agent.id);
        if (existing) {
          this.scene.remove(existing);
          this.statusSprites.delete(agent.id);
        }
        continue;
      }

      let sprite = this.statusSprites.get(agent.id);
      if (!sprite) {
        sprite = createStatusBubble(`${agent.name}: ${agent.statusLabel}`);
        this.statusSprites.set(agent.id, sprite);
        this.scene.add(sprite);
      } else {
        updateStatusBubble(sprite, `${agent.name}: ${agent.statusLabel}`);
      }

      const bob = agentBob(agent);
      sprite.position.set(agent.position[0], agent.position[1] + bob + 2.15, agent.position[2]);
    }

    for (const id of [...this.statusSprites.keys()]) {
      if (!seen.has(id)) {
        const sprite = this.statusSprites.get(id);
        if (sprite) {
          this.scene.remove(sprite);
        }
        this.statusSprites.delete(id);
      }
    }
  }

  dispose() {
    this.scene.remove(this.farMesh);
    this.farMesh.geometry.dispose();
    (this.farMesh.material as THREE.Material).dispose();

    this.scene.remove(this.mediumBoxMesh);
    this.mediumBoxMesh.geometry.dispose();
    (this.mediumBoxMesh.material as THREE.Material).dispose();

    for (const mesh of this.deptMeshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.deptMeshes.clear();

    for (const sprite of this.closeSprites.values()) {
      this.scene.remove(sprite);
      (sprite.material as THREE.SpriteMaterial).map?.dispose();
      sprite.material.dispose();
    }
    this.closeSprites.clear();

    for (const mesh of this.closeMeshes.values()) {
      this.scene.remove(mesh.group);
      this.disposeStylizedAgent(mesh);
    }
    this.closeMeshes.clear();

    for (const sprite of this.statusSprites.values()) {
      this.scene.remove(sprite);
      (sprite.material as THREE.SpriteMaterial).map?.dispose();
      sprite.material.dispose();
    }
    this.statusSprites.clear();

    for (const sprite of this.workEffectSprites.values()) {
      this.scene.remove(sprite);
      (sprite.material as THREE.SpriteMaterial).map?.dispose();
      sprite.material.dispose();
    }
    this.workEffectSprites.clear();

    for (const texture of this.textureCache.values()) {
      texture.dispose();
    }
    this.textureCache.clear();
  }
}