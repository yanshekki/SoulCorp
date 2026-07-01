import {
  DEFAULT_EVENT_CHANCE,
  EVENT_CHANCE_PRESETS,
  FATE_EXAMPLE_EVENT,
  PLAY_MODE_COLUMNS,
} from "../../data/playModeOptions";
import type { PlayMode } from "../../types/game";

export type PlayModeConfig = {
  playMode: PlayMode;
  randomEventsEnabled: boolean;
  randomEventChance: number;
};

type PlayModePickerProps = {
  value: PlayModeConfig;
  onChange: (config: PlayModeConfig) => void;
  compact?: boolean;
};

export function PlayModePicker({ value, onChange, compact = false }: PlayModePickerProps) {
  const selectMode = (mode: PlayMode) => {
    if (mode === "work") {
      onChange({
        playMode: "work",
        randomEventsEnabled: false,
        randomEventChance: value.randomEventChance,
      });
      return;
    }
    onChange({
      playMode: "game",
      randomEventsEnabled: value.randomEventsEnabled,
      randomEventChance: value.randomEventChance || DEFAULT_EVENT_CHANCE,
    });
  };

  const chancePercent = Math.round(value.randomEventChance * 100);

  return (
    <div className={`play-mode-picker ${compact ? "compact" : ""}`}>
      {!compact ? (
        <p className="play-mode-intro muted">
          Pick how much narrative chaos you want. <strong>Work Mode</strong> never rolls random
          events. <strong>Game Mode</strong> lets Fate — your Director of Chance — generate
          context-aware events via AI.
        </p>
      ) : null}

      <div className="play-mode-columns">
        {PLAY_MODE_COLUMNS.map((column) => (
          <button
            key={column.id}
            type="button"
            className={`play-mode-column ${value.playMode === column.id ? "selected" : ""}`}
            onClick={() => selectMode(column.id)}
            aria-pressed={value.playMode === column.id}
          >
            <strong>{column.title}</strong>
            <span>{column.tagline}</span>
            <ul>
              {column.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      {value.playMode === "game" ? (
        <section className="play-mode-game-controls">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={value.randomEventsEnabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  randomEventsEnabled: event.target.checked,
                })
              }
            />
            <span>Enable Fate random events</span>
          </label>

          <div className="play-mode-chance">
            <div className="play-mode-chance-header">
              <span>Event chance per roll</span>
              <strong>{chancePercent}%</strong>
            </div>
            <input
              type="range"
              min={5}
              max={25}
              step={1}
              value={chancePercent}
              disabled={!value.randomEventsEnabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  randomEventChance: Number(event.target.value) / 100,
                })
              }
            />
            <div className="play-mode-presets">
              {EVENT_CHANCE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={value.randomEventChance === preset ? "active" : ""}
                  disabled={!value.randomEventsEnabled}
                  onClick={() =>
                    onChange({
                      ...value,
                      randomEventChance: preset,
                    })
                  }
                >
                  {Math.round(preset * 100)}%
                </button>
              ))}
            </div>
          </div>

          <p className="play-mode-example muted">
            <strong>Example:</strong> {FATE_EXAMPLE_EVENT}
          </p>
          <p className="play-mode-billing muted">
            Each Fate event uses your default AI provider and bills your token wallets. You can
            change the chance later in Settings.
          </p>
        </section>
      ) : (
        <p className="play-mode-work-note muted">
          Work Mode keeps Fate dormant. Your team runs meetings, workspace docs, marketplace gigs,
          and token billing without narrative surprises.
        </p>
      )}
    </div>
  );
}