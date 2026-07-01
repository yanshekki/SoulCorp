import type { Agent } from "../../types/world";
import type { CampusSceneHandles } from "./campusScene";

/** @deprecated Use createCampusScene — kept for agent sync compatibility. */
export type OfficeSceneHandles = CampusSceneHandles;

export class OfficeSceneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfficeSceneError";
  }
}

export function syncSceneAgents(
  handles: CampusSceneHandles,
  agents: Agent[],
  lowPowerMode = false,
  pixelFilterEnabled = false,
) {
  handles.agentRenderer.sync(agents, handles.camera, lowPowerMode, pixelFilterEnabled);
}