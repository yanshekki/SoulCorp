import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import {
  DEFAULT_OFFICE_VISUAL,
  type OfficeVisualConfig,
  type RoomDimensions,
} from "../../types/visualDesign";
import { normalizeOfficeVisual } from "../../utils/officeVisualNormalize";
import { OfficeArchitecturePanel } from "./OfficeArchitecturePanel";

function zoneArea(room: RoomDimensions): number {
  return room.width * room.depth;
}

const DIM_LABELS: Record<keyof RoomDimensions, string> = {
  width: "Width",
  depth: "Depth",
  height: "Height",
};

export function RoomDimensionsPanel() {
  const buildings = useGameStore((state) => state.buildings);
  const selectedBuildingId = useDesignStudioStore((state) => state.selectedBuildingId);
  const draft = useDesignStudioStore((state) => state.draft);
  const patchDraft = useDesignStudioStore((state) => state.patchDraft);

  const buildingId = selectedBuildingId ?? buildings[0]?.id ?? "hq";
  const config = normalizeOfficeVisual(draft.offices[buildingId] ?? DEFAULT_OFFICE_VISUAL, buildingId);
  const totalArea =
    zoneArea(config.lobby_room) + zoneArea(config.corridor_room) + zoneArea(config.room);

  const updateRoom = (
    key: keyof Pick<OfficeVisualConfig, "lobby_room" | "corridor_room" | "room">,
    room: RoomDimensions,
  ) => {
    patchDraft({
      offices: {
        ...draft.offices,
        [buildingId]: { ...config, [key]: room },
      },
    });
  };

  const updateDimension = (
    key: keyof Pick<OfficeVisualConfig, "lobby_room" | "corridor_room" | "room">,
    dim: keyof RoomDimensions,
    value: number,
  ) => {
    const room = config[key];
    updateRoom(key, { ...room, [dim]: value });
  };

  return (
    <section className="design-panel design-room-panel">
      <header>
        <h2>Room size</h2>
        <p className="muted">
          Drag sliders or type meters — floor plan and 3D update together. Total area{" "}
          <strong>{totalArea.toFixed(1)} m²</strong>
        </p>
      </header>

      <OfficeArchitecturePanel />

      {(
        [
          ["Lobby", "lobby_room"],
          ["Corridor", "corridor_room"],
          ["Office", "room"],
        ] as const
      ).map(([label, key]) => {
        const room = config[key];
        return (
          <div key={key} className="design-slider-grid">
            <strong>
              {label}{" "}
              <span className="muted">({zoneArea(room).toFixed(1)} m²)</span>
            </strong>
            {(["width", "depth", "height"] as const).map((dim) => (
              <div key={dim} className="design-room-dim-row">
                <span className="design-room-dim-label">{DIM_LABELS[dim]}</span>
                <input
                  type="range"
                  className="design-room-dim-slider"
                  min={dim === "height" ? 2.4 : 2}
                  max={dim === "height" ? 4.5 : 24}
                  step={0.1}
                  value={room[dim]}
                  onChange={(event) => updateDimension(key, dim, Number(event.target.value))}
                  aria-label={`${label} ${DIM_LABELS[dim]}`}
                />
                <div className="design-room-dim-value">
                  <input
                    type="number"
                    className="design-room-dim-input"
                    inputMode="decimal"
                    min={dim === "height" ? 2.4 : 2}
                    max={dim === "height" ? 4.5 : 24}
                    step={0.1}
                    value={room[dim]}
                    onChange={(event) => updateDimension(key, dim, Number(event.target.value))}
                    aria-label={`${label} ${DIM_LABELS[dim]} (meters)`}
                  />
                  <span className="design-room-dim-unit">m</span>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}