import { useGameStore } from "../../stores/gameStore";
import type { Building } from "../../types/world";

function toMapPosition(x: number, z: number) {
  return {
    left: `calc(50% + ${(x - z) * 28}px)`,
    top: `calc(54% + ${(x + z) * 14}px)`,
  };
}

export function OfficeMapFallback() {
  const agents = useGameStore((state) => state.agents);
  const buildings = useGameStore((state) => state.buildings);
  const selectedBuilding = useGameStore((state) => state.selectedBuilding);
  const selectBuilding = useGameStore((state) => state.selectBuilding);

  const handleSelect = (building: Building) => {
    selectBuilding(selectedBuilding?.id === building.id ? null : building);
  };

  return (
    <div className="office-map-fallback" aria-label="Office map fallback view">
      <div className="office-map-sky" />
      <div className="office-map-ground" />
      {buildings.map((building) => {
        const [x, , z] = building.position;
        const [width, height] = building.size;
        const pos = toMapPosition(x, z);
        const isSelected = selectedBuilding?.id === building.id;

        return (
          <button
            key={building.id}
            type="button"
            className={`office-building ${isSelected ? "selected" : ""}`}
            style={{
              ...pos,
              width: `${width * 26}px`,
              height: `${height * 22}px`,
              background: `linear-gradient(180deg, ${building.roofColor} 0%, ${building.color} 55%)`,
              zIndex: Math.round(100 - z * 10 + x),
            }}
            onClick={() => handleSelect(building)}
          >
            <span className="office-building-name">{building.name}</span>
            <span className="office-building-dept">{building.department}</span>
          </button>
        );
      })}
      {agents.map((agent) => {
        const pos = toMapPosition(agent.position[0], agent.position[2]);
        return (
          <div
            key={agent.id}
            className="office-agent"
            style={{
              ...pos,
              backgroundColor: agent.color,
              zIndex: Math.round(200 - agent.position[2] * 10 + agent.position[0]),
            }}
          >
            <span>{agent.name}</span>
            <small>{agent.statusLabel}</small>
          </div>
        );
      })}
    </div>
  );
}