import { useGameStore } from "../../stores/gameStore";

function toOverlayPosition(x: number, z: number) {
  return {
    left: `calc(50% + ${(x - z) * 32}px)`,
    top: `calc(52% + ${(x + z) * 16}px)`,
  };
}

export function WorldLabels() {
  const agents = useGameStore((state) => state.agents);
  const buildings = useGameStore((state) => state.buildings);

  return (
    <div className="world-labels" aria-hidden>
      {buildings.map((building) => {
        const [x, , z] = building.position;
        return (
          <div
            key={building.id}
            className="world-label building-label"
            style={toOverlayPosition(x, z)}
          >
            <strong>{building.name}</strong>
            <span>{building.department}</span>
          </div>
        );
      })}
      {agents.map((agent) => (
        <div
          key={agent.id}
          className="world-label agent-label"
          style={{
            ...toOverlayPosition(agent.position[0], agent.position[2]),
            borderColor: agent.color,
          }}
        >
          <strong>{agent.name}</strong>
          <span>{agent.statusLabel}</span>
        </div>
      ))}
    </div>
  );
}