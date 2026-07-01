import * as THREE from "three";
import type { Agent } from "../../types/world";
import {
  getAgentPixelTexture,
  getDepartmentPixelTexture,
  walkFrameIndex,
} from "./pixelAgentSprite";

const MAX_FAR_AGENTS = 256;
const MAX_DEPT_AGENTS = 64;
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

function agentBillboardMatrix(agent: Agent, scale: number): THREE.Matrix4 {
  const bob = agentBob(agent);
  tempObject.position.set(agent.position[0], agent.position[1] + bob + 0.55, agent.position[2]);
  tempObject.rotation.set(0, Math.atan2(
    cameraPosition.x - agent.position[0],
    cameraPosition.z - agent.position[2],
  ), 0);
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
  private readonly deptMeshes = new Map<string, THREE.InstancedMesh>();
  private readonly closeSprites = new Map<string, THREE.Sprite>();
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
  }

  sync(agents: Agent[], camera: THREE.Camera, lowPowerMode: boolean) {
    const bucket = classifyAgents(agents, camera, lowPowerMode);
    const seen = new Set(agents.map((agent) => agent.id));

    this.syncFarAgents(bucket.far);
    this.syncMediumAgents(bucket.medium);
    this.syncCloseAgents(bucket.close);
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
      (agent) => agent.status === "working" && agent.behavior.intent === "working",
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

  private syncFarAgents(agents: Agent[]) {
    this.farMesh.count = Math.min(agents.length, MAX_FAR_AGENTS);
    agents.slice(0, MAX_FAR_AGENTS).forEach((agent, index) => {
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

  private syncMediumAgents(groups: Map<string, Agent[]>) {
    const activeDepartments = new Set(groups.keys());

    for (const [department, agents] of groups) {
      let mesh = this.deptMeshes.get(department);
      if (!mesh) {
        const geometry = new THREE.PlaneGeometry(0.9, 1.2);
        const material = new THREE.MeshStandardMaterial({
          map: getDepartmentPixelTexture(this.textureCache, department),
          transparent: true,
          alphaTest: 0.4,
          side: THREE.DoubleSide,
          toneMapped: false,
        });
        mesh = new THREE.InstancedMesh(geometry, material, MAX_DEPT_AGENTS);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.deptMeshes.set(department, mesh);
        this.scene.add(mesh);
      }

      mesh.count = Math.min(agents.length, MAX_DEPT_AGENTS);
      agents.slice(0, MAX_DEPT_AGENTS).forEach((agent, index) => {
        mesh!.setMatrixAt(index, agentBillboardMatrix(agent, 0.95));
      });
      mesh.instanceMatrix.needsUpdate = true;
      activeDepartments.add(department);
    }

    for (const [department, mesh] of this.deptMeshes) {
      if (!activeDepartments.has(department)) {
        mesh.count = 0;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  private syncCloseAgents(agents: Agent[]) {
    const active = new Set<string>();
    for (const agent of agents) {
      active.add(agent.id);
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

      const bob = agentBob(agent);
      sprite.position.set(agent.position[0], agent.position[1] + bob + 0.75, agent.position[2]);
      sprite.scale.set(1.15, 1.45, 1);
      sprite.material.rotation = 0;
    }

    for (const [id, sprite] of this.closeSprites) {
      if (!active.has(id)) {
        this.scene.remove(sprite);
        this.closeSprites.delete(id);
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

    for (const agent of agents) {
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