import type { Agent } from "../../types/world";
import { walkFrameIndex } from "./pixelAgentSprite";
import type { StylizedAgentMesh } from "./stylizedAgent";

function agentScale(agent: Agent): number {
  return agent.appearance.height * agent.appearance.build;
}

/** Procedural pose for close/interior stylized agents (walk, idle, working, seated). */
export function applyStylizedAgentAnimation(
  mesh: StylizedAgentMesh,
  agent: Agent,
  phase: number,
  seated = false,
): void {
  const scale = agentScale(agent);
  const walking = agent.status === "walking" && !seated;
  const working = agent.status === "working" || agent.behavior.intent === "working";
  const meeting = agent.status === "meeting";

  const baseBodyY = seated ? 0.55 * scale : 0.65 * scale;
  const baseHeadY = seated ? 1.02 * scale : 1.18 * scale;
  const basePantsY = seated ? 0.22 * scale : 0.28 * scale;

  if (walking) {
    const stride = Math.sin(agent.walkPhase);
    const frame = walkFrameIndex(agent.walkPhase, true);
    const legSwing = frame === 1 ? 0.05 : frame === 3 ? -0.05 : 0;
    const armSwing = frame === 1 ? -0.08 : frame === 3 ? 0.08 : 0;

    mesh.body.position.y = baseBodyY + Math.abs(stride) * 0.04 * scale;
    mesh.head.position.y = baseHeadY + stride * 0.02 * scale;
    mesh.pants.position.y = basePantsY;
    mesh.pants.position.x = legSwing * scale;
    mesh.body.rotation.z = stride * 0.06;
    mesh.head.rotation.x = stride * 0.04;
    mesh.hair.position.y = mesh.head.position.y + 0.04 * scale;

    mesh.body.position.x = armSwing * 0.35 * scale;
    mesh.head.position.x = armSwing * 0.15 * scale;
    mesh.pants.rotation.z = -stride * 0.08;
    return;
  }

  mesh.body.rotation.z = 0;
  mesh.pants.rotation.z = 0;
  mesh.head.rotation.x = 0;
  mesh.body.position.x = 0;
  mesh.head.position.x = 0;
  mesh.pants.position.x = 0;

  if (working && seated) {
    const typing = Math.sin(phase * 5.5);
    mesh.body.position.y = baseBodyY + typing * 0.012 * scale;
    mesh.head.position.y = baseHeadY - 0.04 * scale + Math.sin(phase * 3.2) * 0.015 * scale;
    mesh.head.rotation.x = 0.18 + Math.sin(phase * 4.1) * 0.04;
    mesh.pants.position.y = basePantsY;
    mesh.hair.position.y = mesh.head.position.y + 0.04 * scale;
    return;
  }

  if (working) {
    mesh.body.position.y = baseBodyY + Math.sin(phase * 2.4) * 0.02 * scale;
    mesh.head.position.y = baseHeadY + Math.sin(phase * 1.8) * 0.01 * scale;
    mesh.head.rotation.x = 0.08;
  } else if (meeting) {
    mesh.body.position.y = baseBodyY + Math.sin(phase * 1.2) * 0.015 * scale;
    mesh.head.position.y = baseHeadY + Math.sin(phase * 0.9 + 0.6) * 0.02 * scale;
    mesh.head.rotation.y = Math.sin(phase * 0.8) * 0.12;
  } else {
    const idleBob = Math.sin(phase * 1.5) * 0.012 * scale;
    mesh.body.position.y = baseBodyY + idleBob;
    mesh.head.position.y = baseHeadY + idleBob * 0.6;
    mesh.head.rotation.y = 0;
    mesh.head.rotation.x = 0;
  }

  mesh.pants.position.y = basePantsY;
  mesh.hair.position.y = mesh.head.position.y + 0.04 * scale;
}