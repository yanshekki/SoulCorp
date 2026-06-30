import { invoke } from "@tauri-apps/api/core";
import { useGameStore } from "../../stores/gameStore";
import type { EventMode, ExportResult, GameSettings } from "../../types/game";

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
          pure_local_mode: patch.pure_local_mode,
          pixel_filter_enabled: patch.pixel_filter_enabled,
          low_power_mode: patch.low_power_mode,
          backup_interval_minutes: patch.backup_interval_minutes,
        },
      });
      setSettings(next);
      setStatusMessage("Settings updated.");
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const exportBackup = async () => {
    const result = await invoke<ExportResult>("export_company_backup");
    setStatusMessage(`${result.message} ${result.path}`);
  };

  const exportWorkspace = async () => {
    const result = await invoke<ExportResult>("export_workspace_markdown_zip");
    setStatusMessage(`${result.message} ${result.path}`);
  };

  return (
    <section className="panel-card settings-panel">
      <h2>Settings</h2>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.pure_local_mode}
          onChange={(event) =>
            void updateSettings({ pure_local_mode: event.target.checked })
          }
        />
        <span>Pure Local Mode (zero cloud)</span>
      </label>

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

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.pixel_filter_enabled}
          onChange={(event) =>
            void updateSettings({ pixel_filter_enabled: event.target.checked })
          }
        />
        <span>Pixel filter (cozy retro look)</span>
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.low_power_mode}
          onChange={(event) =>
            void updateSettings({ low_power_mode: event.target.checked })
          }
        />
        <span>Low power mode (better FPS)</span>
      </label>

      <label className="field-label">
        Auto-backup interval (minutes, 0 = off)
        <input
          type="number"
          min={0}
          max={1440}
          value={settings.backup_interval_minutes}
          onChange={(event) =>
            void updateSettings({
              backup_interval_minutes: Number(event.target.value),
            })
          }
        />
      </label>

      <label className="field-label">
        AI Provider
        <select
          value={settings.ai_provider}
          onChange={(event) => void updateSettings({ ai_provider: event.target.value })}
          disabled={settings.pure_local_mode}
        >
          <option value="mock">Mock (offline)</option>
          <option value="ollama">Ollama (Phase 5)</option>
          <option value="soulmd-hub">soulmd-hub API (Phase 5)</option>
        </select>
      </label>

      <div className="panel-actions stacked">
        <button type="button" onClick={() => void exportBackup()}>
          Export Company Backup (JSON)
        </button>
        <button type="button" onClick={() => void exportWorkspace()}>
          Export Workspace (Markdown ZIP)
        </button>
      </div>
    </section>
  );
}