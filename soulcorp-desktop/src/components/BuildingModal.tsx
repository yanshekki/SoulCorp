import { useGameStore } from "../stores/gameStore";

export function BuildingModal() {
  const selectedBuilding = useGameStore((state) => state.selectedBuilding);
  const selectBuilding = useGameStore((state) => state.selectBuilding);
  const agents = useGameStore((state) => state.agents);

  if (!selectedBuilding) {
    return null;
  }

  const departmentAgents = agents.filter(
    (agent) => agent.department === selectedBuilding.department,
  );

  return (
    <div className="building-modal-overlay" role="dialog" aria-modal="true">
      <div className="building-modal">
        <header>
          <div>
            <p className="modal-eyebrow">{selectedBuilding.department}</p>
            <h2>{selectedBuilding.name}</h2>
          </div>
          <button type="button" onClick={() => selectBuilding(null)}>
            Back to campus
          </button>
        </header>
        <p>{selectedBuilding.description}</p>
        <section>
          <h3>Agents in this area</h3>
          {departmentAgents.length === 0 ? (
            <p className="muted">No agents assigned yet.</p>
          ) : (
            <ul>
              {departmentAgents.map((agent) => (
                <li key={agent.id}>
                  <strong>{agent.name}</strong> — {agent.role} ({agent.statusLabel})
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}