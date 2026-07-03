import { showAgentMorale, showEventFeed, showSimulationChrome } from "../../config/features";
import { useGameStore } from "../../stores/gameStore";
import { totalCompanyTokens } from "../../utils/companyState";
import { agentInnovationScore, agentSkillLevel } from "../../utils/agentStats";
import { EventFeed } from "./EventFeed";

export function Dashboard() {
  const agents = useGameStore((state) => state.agents);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const simulation = useGameStore((state) => state.simulation);
  const finance = useGameStore((state) => state.finance);
  const companyName = useGameStore((state) => state.companyName);

  const records = agentRecords.length > 0 ? agentRecords : null;
  const hasAgents = (records?.length ?? agents.length) > 0;

  return (
    <section className="dashboard-panel">
      <h2>{companyName || "Company Dashboard"}</h2>
      {!hasAgents ? (
        <p className="muted">No agents yet. Create or select a company to populate this dashboard.</p>
      ) : null}
      <div className="kpi-grid">
        {showSimulationChrome ? (
          <>
            <article>
              <span>Day</span>
              <strong>{simulation.dayNumber}</strong>
            </article>
            <article>
              <span>Tick</span>
              <strong>{simulation.tick}</strong>
            </article>
          </>
        ) : null}
        <article>
          <span>Tokens</span>
          <strong>{totalCompanyTokens(finance).toLocaleString()}</strong>
        </article>
        <article>
          <span>Agents</span>
          <strong>{records?.length ?? agents.length}</strong>
        </article>
      </div>
      <div className="agent-list">
        <h3>Live Agents</h3>
        {(records ?? []).map((agent) => (
          <div key={agent.id} className="agent-row">
            <span className="agent-dot" style={{ backgroundColor: "#5ec8ff" }} />
            <div>
              <strong>{agent.name}</strong>
              <p>
                {agent.department}
                {showAgentMorale ? ` · morale ${(agent.morale * 100).toFixed(0)}%` : ""} · skill{" "}
                {agentSkillLevel(agent)} · innovation {agentInnovationScore(agent)}
              </p>
            </div>
            <span className="agent-state">{agent.status}</span>
          </div>
        ))}
        {!records &&
          agents.map((agent) => (
            <div key={agent.id} className="agent-row">
              <span className="agent-dot" style={{ backgroundColor: agent.color }} />
              <div>
                <strong>{agent.name}</strong>
                <p>
                  {agent.department} · {agent.statusLabel}
                </p>
              </div>
            </div>
          ))}
      </div>
      {showEventFeed ? <EventFeed /> : null}
    </section>
  );
}