import { useGameStore } from "../../stores/gameStore";
import type { Building } from "../../types/world";
import { tryExitInterior } from "../../utils/buildModeExit";
import { FallbackFloorPlan } from "./FallbackFloorPlan";

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
  const visualDesign = useGameStore((state) => state.visualDesign);
  const selectBuilding = useGameStore((state) => state.selectBuilding);
  const enterInterior = useGameStore((state) => state.enterInterior);
  const worldView = useGameStore((state) => state.worldView);
  const interiorBuildingId = useGameStore((state) => state.interiorBuildingId);

  const handleSelect = (building: Building) => {
    selectBuilding(selectedBuilding?.id === building.id ? null : building);
  };

  const skyStyle = {
    background: `linear-gradient(180deg, ${visualDesign.campus.sky_top}, ${visualDesign.campus.sky_bottom})`,
  };

  if (worldView === "interior" && interiorBuildingId) {
    const building = buildings.find((b) => b.id === interiorBuildingId);
    const office = visualDesign.offices[interiorBuildingId];
    const buildingAgents = agents.filter((agent) => agent.department === building?.department);
    return (
      <div className="office-map-fallback interior-fallback" aria-label="Interior map view">
        <div className="office-map-sky" style={skyStyle} />
        <div
          className="office-map-interior-room"
          style={{
            background: `linear-gradient(180deg, ${office?.wall_color ?? "#f5f0e8"}, ${office?.floor_color ?? "#d9cfc0"})`,
          }}
        >
          <header className="fallback-interior-header">
            <h3>{building?.name ?? "Interior"}</h3>
            <p className="muted">{building?.department}</p>
          </header>
          <div className="fallback-floor-plan-wrap">
            <FallbackFloorPlan
              buildingId={interiorBuildingId}
              office={office}
              agents={buildingAgents}
              accentColor={office?.accent_color ?? "#5ec8ff"}
            />
          </div>
          <button type="button" className="primary-action" onClick={() => void tryExitInterior()}>
            Back to campus
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="office-map-fallback" aria-label="Office map fallback view">
      <div className="office-map-sky" style={skyStyle} />
      <div
        className="office-map-ground"
        style={{
          background: `linear-gradient(180deg, ${visualDesign.campus.ground_primary}, ${visualDesign.campus.ground_secondary})`,
        }}
      />
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
            <span
              className="office-building-enter"
              onClick={(event) => {
                event.stopPropagation();
                enterInterior(building.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.stopPropagation();
                  enterInterior(building.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              Enter
            </span>
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