import * as THREE from "three";
import type { Agent } from "../../types/world";

export interface StylizedAgentMesh {
  group: THREE.Group;
  head: THREE.Mesh;
  body: THREE.Mesh;
}

export function createStylizedAgent(agent: Agent, seated = false): StylizedAgentMesh {
  const { appearance } = agent;
  const scale = appearance.height * appearance.build;

  const group = new THREE.Group();
  group.userData.agentId = agent.id;
  group.userData.agent = agent;

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22 * scale, 0.42 * scale, 4, 8),
    new THREE.MeshStandardMaterial({ color: appearance.shirtColor, roughness: 0.65 }),
  );
  body.position.y = seated ? 0.55 * scale : 0.65 * scale;
  body.castShadow = true;

  const pants = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2 * scale, 0.22 * scale, 0.35 * scale, 8),
    new THREE.MeshStandardMaterial({ color: appearance.pantsColor, roughness: 0.75 }),
  );
  pants.position.y = seated ? 0.22 * scale : 0.28 * scale;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2 * scale, 10, 10),
    new THREE.MeshStandardMaterial({ color: appearance.skinColor, roughness: 0.55 }),
  );
  head.position.y = seated ? 1.02 * scale : 1.18 * scale;
  head.castShadow = true;

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.19 * scale, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: appearance.hairColor, roughness: 0.8 }),
  );
  hair.position.y = head.position.y + 0.04 * scale;

  group.add(body, pants, head, hair);
  return { group, head, body };
}

export function createSkillProp(skill: string): THREE.Mesh {
  const normalized = skill.toLowerCase();
  let mesh: THREE.Mesh;
  if (normalized.includes("ai") || normalized.includes("ml")) {
    mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12, 0),
      new THREE.MeshStandardMaterial({ color: "#7ee8ff", emissive: "#2a8faa", emissiveIntensity: 0.6 }),
    );
  } else if (normalized.includes("design") || normalized.includes("ui")) {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.02, 0.14),
      new THREE.MeshStandardMaterial({ color: "#ff8fab" }),
    );
  } else {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.04, 0.16),
      new THREE.MeshStandardMaterial({ color: "#4a5568", metalness: 0.3, roughness: 0.4 }),
    );
  }
  mesh.position.y = 0.08;
  return mesh;
}

export function updateAgentTransform(
  mesh: StylizedAgentMesh,
  position: [number, number, number],
  seated: boolean,
): void {
  mesh.group.position.set(position[0], position[1], position[2]);
  if (seated) {
    mesh.group.rotation.y = Math.PI;
    mesh.body.position.y = 0.55;
  } else {
    mesh.group.rotation.y = 0;
  }
}

function statusBubbleLabel(agent: Agent): string {
  if (agent.statusLabel?.trim()) {
    return agent.statusLabel;
  }
  switch (agent.status) {
    case "working":
      return "Working…";
    case "walking":
      return "On the move";
    case "meeting":
      return "In meeting";
    default:
      return "Idle";
  }
}

export function agentStatusBubble(agent: Agent): THREE.Sprite {
  const label = statusBubbleLabel(agent);
  const canvas = document.createElement("canvas");
  canvas.width = 220;
  canvas.height = 44;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(20, 32, 48, 0.88)";
    ctx.beginPath();
    ctx.roundRect(10, 6, 200, 28, 8);
    ctx.fill();
    ctx.fillStyle = agent.status === "working" ? "#9ed8ff" : "#f4f8ff";
    ctx.font = "bold 14px system-ui";
    ctx.fillText(label, 20, 26);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.35, 0.27, 1);
  sprite.position.y = 1.95;
  return sprite;
}

export function agentBillboardName(agent: Agent): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 48;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(20, 32, 48, 0.82)";
    ctx.fillRect(12, 8, 232, 32);
    ctx.fillStyle = "#f4f8ff";
    ctx.font = "bold 16px system-ui";
    ctx.fillText(agent.name, 22, 30);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.6, 0.32, 1);
  sprite.position.y = 1.42;
  return sprite;
}