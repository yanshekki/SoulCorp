import { useMemo } from "react";
import { useGameStore } from "../../../stores/gameStore";
import { useAgentActivityStore } from "../../../stores/agentActivityStore";
import { EffectiveBrainPill } from "../brain/EffectiveBrainPill";
import type { AgentActivitySession } from "../../../types/agentActivity";

interface AgentLiveGridProps {
  onSelectAgent: (agentId: string) => void;
}

function transportForActivity(
  transport: string,
): "api" | "subprocess" | "builtin" | undefined {
  if (transport === "api" || transport === "mock") {
    return "api";
  }
  if (transport === "subprocess") {
    return "subprocess";
  }
  if (transport === "llm_only" || transport === "builtin") {
    return "builtin";
  }
  return undefined;
}

function activeSessionForAgent(
  sessions: AgentActivitySession[],
  agentId: string,
): AgentActivitySession | undefined {
  return sessions.find(
    (session) => session.agent_id === agentId && session.status === "active",
  );
}

export function AgentLiveGrid({ onSelectAgent }: AgentLiveGridProps) {
  const agentRecords = useGameStore((state) => state.agentRecords);
  const agents = useGameStore((state) => state.agents);
  const sessions = useAgentActivityStore((state) => state.sessions);
  const selectedAgentId = useAgentActivityStore((state) => state.selectedAgentId);
  const filterAgentId = useAgentActivityStore((state) => state.filterAgentId);

  const rows = useMemo(
    () =>
      agentRecords
        .filter((agent) => agent.agent_kind !== "fate")
        .filter((agent) => (filterAgentId ? agent.id === filterAgentId : true)),
    [agentRecords, filterAgentId],
  );

  return (
    <section className="observatory-grid">
      <header className="observatory-grid-header">
        <h3>Agents</h3>
        <p className="muted">{rows.length} employees</p>
      </header>
      <ul className="observatory-grid-list">
        {rows.map((record) => {
          const runtimeAgent = agents.find((agent) => agent.id === record.id);
          const status = runtimeAgent?.statusLabel ?? record.status;
          const active = activeSessionForAgent(sessions, record.id);
          const selected = selectedAgentId === record.id;
          return (
            <li key={record.id}>
              <button
                type="button"
                className={`observatory-grid-card ${selected ? "is-selected" : ""}`}
                onClick={() => onSelectAgent(record.id)}
              >
                <div className="observatory-grid-card-head">
                  <span
                    className={`observatory-status-dot observatory-status-dot--${status}`}
                    aria-hidden="true"
                  />
                  <strong>{record.name}</strong>
                  {active ? <span className="observatory-live-pill inline">LIVE</span> : null}
                </div>
                <p className="muted">
                  {record.role} · {record.department}
                </p>
                <p className="observatory-grid-status">{status}</p>
                {active ? (
                  <>
                    <p className="observatory-grid-task">
                      {active.work_node_title ?? active.source}
                    </p>
                    <EffectiveBrainPill
                      label={active.brain_label}
                      transport={transportForActivity(active.transport)}
                    />
                  </>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}