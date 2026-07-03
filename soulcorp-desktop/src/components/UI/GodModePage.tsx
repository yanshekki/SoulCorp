import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { GameSettings } from "../../types/game";
import { GodModeDisabledGate, GodModePanel } from "./GodModePanel";

export function GodModePage() {
  const settings = useGameStore((state) => state.settings);
  const setSettings = useGameStore((state) => state.setSettings);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [enabling, setEnabling] = useState(false);

  const enableGodMode = async () => {
    setEnabling(true);
    try {
      const next = await invoke<GameSettings>("update_game_settings", {
        update: { god_mode_enabled: true },
      });
      setSettings(next);
      setStatusMessage("God Mode enabled. Use CEO powers wisely.");
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setEnabling(false);
    }
  };

  return (
    <div className="god-mode-page">
      <header className="god-mode-page-header">
        <div>
          <h2>God Mode</h2>
          <p className="muted">CEO intervention powers with visible consequences.</p>
        </div>
      </header>

      {settings.god_mode_enabled ? (
        <GodModePanel />
      ) : (
        <GodModeDisabledGate onEnable={() => void enableGodMode()} busy={enabling} />
      )}
    </div>
  );
}