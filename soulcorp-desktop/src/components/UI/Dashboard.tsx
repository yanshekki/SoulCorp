import { useGameStore } from "../../stores/gameStore";

export function Dashboard() {
  const agents = useGameStore((state) => state.agents);
  const simulation = useGameStore((state) => state.simulation);
  const companyName = useGameStore((state) => state.companyName);

  const walking = agents.filter((agent) => agent.status === "walking").length;
  const working = agents.filter((agent) => agent.status !== "walking").length;

  return (
    <section className="dashboard-panel">
      <h2>{companyName}</h2>
      <div className="kpi-grid">
        <article>
          <span>Day</span>
          <strong>{simulation.dayNumber}</strong>
        </article>
        <article>
          <span>Tick</span>
          <strong>{simulation.tick}</strong>
        </article>
        <article>
          <span>Agents</span>
          <strong>{agents.length}</strong>
        </article>
        <article>
          <span>Active</span>
          <strong>{simulation.agentsActive}</strong>
        </article>
      </div>
      <div className="agent-list">
        <h3>Live Agents</h3>
        {agents.map((agent) => (
          <div key={agent.id} className="agent-row">
            <span className="agent-dot" style={{ backgroundColor: agent.color }} />
            <div>
              <strong>{agent.name}</strong>
              <p>
                {agent.department} · {agent.statusLabel}
              </p>
            </div>
            <span className="agent-state">{agent.status === "walking" ? "Moving" : "Idle"}</span>
          </div>
        ))}
      </div>
      <p className="dashboard-footnote">
        {walking} walking · {working} idle/working
      </p>
    </section>
  );
}