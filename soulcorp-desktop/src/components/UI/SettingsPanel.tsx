import { invoke } from "@tauri-apps/api/core";
import { useGameStore } from "../../stores/gameStore";
import type { EventMode, GameSettings } from "../../types/game";

export function SettingsPanel() {
  const settings = useGameStore((state) => state.settings);
  const setSettings = useGameStore((state) => state.setSettings);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  const updateSettings = async (patch: Partial<GameSettings>) => {
    try {
      const next = await invoke<GameSettings>("update_game_settings", {
        update: {
          random_events_enabled: patch.random_events_enabled,
          event_mode: patch.event_mode,
          god_mode_enabled: patch.god_mode_enabled,
          ai_provider: patch.ai_provider,
        },
      });
      setSettings(next);
      setStatusMessage("Settings updated.");
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  return (
    <section className="panel-card">
      <h2>Settings</h2>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.random_events_enabled}
          onChange={(event) =>
            void updateSettings({ random_events_enabled: event.target.checked })
          }
        />
        <span>Enable Random Events & Drama</span>
      </label>

      <label className="field-label">
        Event mode
        <select
          value={settings.event_mode}
          onChange={(event) =>
            void updateSettings({ event_mode: event.target.value as EventMode })
          }
        >
          <option value="fun">Fun Mode</option>
          <option value="balanced">Balanced Mode</option>
          <option value="serious">Serious Work Mode</option>
        </select>
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.god_mode_enabled}
          onChange={(event) =>
            void updateSettings({ god_mode_enabled: event.target.checked })
          }
        />
        <span>Enable God Mode</span>
      </label>

      <label className="field-label">
        AI Provider
        <select
          value={settings.ai_provider}
          onChange={(event) => void updateSettings({ ai_provider: event.target.value })}
        >
          <option value="mock">Mock (offline)</option>
          <option value="ollama">Ollama (Phase 5)</option>
          <option value="soulmd-hub">soulmd-hub API (Phase 5)</option>
        </select>
      </label>
    </section>
  );
}