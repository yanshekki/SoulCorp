import type { AgentRecord } from "../types/game";

export function agentSkillLevel(agent: AgentRecord): number {
  return Math.round((agent.morale * 0.55 + agent.energy * 0.45) * 100);
}

export function agentInnovationScore(agent: AgentRecord): number {
  return Math.round(agent.morale * agent.energy * 100);
}