import {
  DEFAULT_EVENT_CHANCE,
  EVENT_CHANCE_PRESETS,
    PLAY_MODE_COLUMNS,
} from "../../data/playModeOptions";
import type { PlayMode } from "../../types/game";
import { useI18n } from "../../i18n/I18nProvider";

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
  const { t } = useI18n();
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
          {t("playMode.intro", {
            work: t("playMode.workStrong"),
            game: t("playMode.gameStrong"),
          })}
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
            <strong>{t(column.titleKey)}</strong>
            <span>{t(column.taglineKey)}</span>
            <ul>
              {column.highlightKeys.map((item) => (
                <li key={item}>{t(item)}</li>
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
            <span>{t("playMode.fateEvents")}</span>
          </label>

          <div className="play-mode-chance">
            <div className="play-mode-chance-header">
              <span>{t("playMode.eventChance")}</span>
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
            <strong>{t("playMode.example")}</strong> {t("playMode.fateExample")}
          </p>
          <p className="play-mode-billing muted">
            Each Fate event uses your default AI provider and bills your token wallets. You can
            change the chance later in Settings.
          </p>
        </section>
      ) : (
        <p className="play-mode-work-note muted">
          {t("playMode.workFooter")}</p>
      )}
    </div>
  );
}