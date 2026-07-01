import { audioDirector } from "../../audio/AudioDirector";
import { useGameStore } from "../../stores/gameStore";
import type { InteriorZone } from "../../types/visualDesign";

const WALK_ZONES: Array<{ id: InteriorZone; label: string; icon: string }> = [
  { id: "lobby", label: "Lobby", icon: "🚪" },
  { id: "corridor", label: "Hall", icon: "↔" },
  { id: "office", label: "Office", icon: "🗄" },
];

interface TPHGameDockProps {
  onOpenInspector: () => void;
}

export function TPHGameDock({ onOpenInspector }: TPHGameDockProps) {
  const buildMode = useGameStore((state) => state.buildMode);
  const toggleBuildMode = useGameStore((state) => state.toggleBuildMode);
  const interiorCameraMode = useGameStore((state) => state.interiorCameraMode);
  const interiorWalkZone = useGameStore((state) => state.interiorWalkZone);
  const requestInteriorWalkZone = useGameStore((state) => state.requestInteriorWalkZone);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const setInspectorExpanded = useGameStore((state) => state.setInspectorExpanded);

  const showZones = buildMode === "play" && interiorCameraMode === "walk";

  const enterBuild = () => {
    audioDirector.playSfx("ui_mode_switch");
    if (buildMode !== "build") {
      toggleBuildMode();
    }
  };

  const openAgents = () => {
    audioDirector.playSfx("ui_click");
    setActivePanel("agents");
    setInspectorExpanded(true);
    onOpenInspector();
  };

  const openDashboard = () => {
    audioDirector.playSfx("ui_click");
    setActivePanel("office");
    setInspectorExpanded(true);
    onOpenInspector();
  };

  return (
    <nav className="tph-game-dock" aria-label="Game menu">
      {showZones ? (
        <div className="tph-dock-section" role="group" aria-label="Walk zones">
          <span className="tph-dock-heading">Zones</span>
          {WALK_ZONES.map((zone) => (
            <button
              key={zone.id}
              type="button"
              className={`tph-dock-btn${interiorWalkZone === zone.id ? " active" : ""}`}
              onClick={() => {
                audioDirector.playSfx("ui_click");
                requestInteriorWalkZone(zone.id);
              }}
              title={zone.label}
            >
              <span className="tph-dock-btn-icon" aria-hidden>
                {zone.icon}
              </span>
              <span className="tph-dock-btn-label">{zone.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="tph-dock-section" role="group" aria-label="Build and staff">
        <button
          type="button"
          className={`tph-dock-btn tph-dock-btn--primary${buildMode === "build" ? " active" : ""}`}
          onClick={enterBuild}
          title="Build mode"
        >
          <span className="tph-dock-btn-icon" aria-hidden>
            🔨
          </span>
          <span className="tph-dock-btn-label">Build</span>
        </button>
        <button type="button" className="tph-dock-btn" onClick={openAgents} title="Agent brains">
          <span className="tph-dock-btn-icon" aria-hidden>
            🧠
          </span>
          <span className="tph-dock-btn-label">Hire</span>
        </button>
        <button type="button" className="tph-dock-btn" onClick={openDashboard} title="Company dashboard">
          <span className="tph-dock-btn-icon" aria-hidden>
            📊
          </span>
          <span className="tph-dock-btn-label">Stats</span>
        </button>
      </div>
    </nav>
  );
}