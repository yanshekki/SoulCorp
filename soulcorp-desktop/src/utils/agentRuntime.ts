import type { Agent } from "../types/world";

/** High-frequency agent positions for the 3D renderer (avoids 60fps React updates). */
export const agentRuntimeRef: { current: Agent[] } = { current: [] };

export function syncAgentRuntime(agents: Agent[]): void {
  agentRuntimeRef.current = agents;
}