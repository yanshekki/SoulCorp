import type { AgentRecord } from "../types/game";

export function defaultSoulMdForAgent(agent: AgentRecord): string {
  const name = agent.name.trim() || "Unnamed Agent";
  return `# ${name}

## Personality
Not specified.

## Values
Not specified.

## Communication Style
Not specified.
`;
}

export function soulMdForAgent(agent: AgentRecord): string {
  const existing = agent.soul?.raw_content?.trim();
  if (existing) {
    return existing;
  }
  return defaultSoulMdForAgent(agent);
}