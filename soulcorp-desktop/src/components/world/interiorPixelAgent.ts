import * as THREE from "three";
import type { Agent } from "../../types/world";
import { getAgentPixelTexture, walkFrameIndex } from "./pixelAgentSprite";
import { agentBillboardName, agentStatusBubble } from "./stylizedAgent";

export interface InteriorPixelAgent {
  group: THREE.Group;
  sprite: THREE.Sprite;
  textureCache: Map<string, THREE.CanvasTexture>;
}

export function createInteriorPixelAgent(agent: Agent): InteriorPixelAgent {
  const textureCache = new Map<string, THREE.CanvasTexture>();
  const texture = getAgentPixelTexture(textureCache, agent, 0);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.9, 1.35, 1);
  sprite.position.y = 0.72;
  sprite.renderOrder = 6;

  const group = new THREE.Group();
  group.userData.agentId = agent.id;
  group.userData.agent = agent;
  group.userData.baseY = 0;
  group.userData.textureCache = textureCache;
  group.userData.pixelSprite = sprite;
  group.add(sprite);
  group.add(agentBillboardName(agent));
  group.add(agentStatusBubble(agent));

  return { group, sprite, textureCache };
}

export function updateInteriorPixelAgent(
  visual: InteriorPixelAgent,
  agent: Agent,
  phase: number,
): void {
  const walking = agent.status === "walking";
  const frame = walkFrameIndex(phase, walking);
  const material = visual.sprite.material as THREE.SpriteMaterial;
  const nextTexture = getAgentPixelTexture(visual.textureCache, agent, frame);
  if (material.map !== nextTexture) {
    material.map = nextTexture;
    material.needsUpdate = true;
  }
}