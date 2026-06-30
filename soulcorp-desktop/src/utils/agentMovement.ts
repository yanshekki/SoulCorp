import type { AgentRecord } from "../types/game";
import type { Agent, Building } from "../types/world";
import { advanceAgentBehavior } from "./agentBehavior";

export function advanceAgents(
  agents: Agent[],
  agentRecords: AgentRecord[],
  buildings: Building[],
  delta: number,
  tick: number,
): Agent[] {
  const recordMap = new Map(agentRecords.map((record) => [record.id, record]));

  return agents.map((agent) =>
    advanceAgentBehavior(agent, recordMap.get(agent.id), buildings, delta, tick),
  );
}