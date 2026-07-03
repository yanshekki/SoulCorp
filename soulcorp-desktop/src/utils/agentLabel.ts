import type { AgentRecord } from "../types/game";

export type AgentLabelInput = Pick<AgentRecord, "name" | "role" | "department">;

/** Role hired via Recruitment (AgentRecord.role) with department context. */
export function formatAgentRoleLabel(agent: AgentLabelInput): string {
  const role = agent.role?.trim();
  const department = agent.department?.trim();
  if (role && department) return `${role} · ${department}`;
  return role || department || "";
}

/** Dropdown / checkbox label: name plus recruitment role. */
export function formatAgentOptionLabel(agent: AgentLabelInput): string {
  const rolePart = formatAgentRoleLabel(agent);
  return rolePart ? `${agent.name} — ${rolePart}` : agent.name;
}

/** Compact label when space is tight (e.g. kanban). */
export function formatAgentShortLabel(agent: AgentLabelInput): string {
  const role = agent.role?.trim();
  return role ? `${agent.name} (${role})` : agent.name;
}

export function agentLabelById(
  agents: Iterable<Pick<AgentRecord, "id" | "name" | "role" | "department">>,
): Map<string, string> {
  return new Map(
    Array.from(agents, (agent) => [agent.id, formatAgentOptionLabel(agent)]),
  );
}