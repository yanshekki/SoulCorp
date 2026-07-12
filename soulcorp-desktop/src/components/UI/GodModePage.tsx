import { invoke } from "../../utils/tauriInvoke";
import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { useGameStore } from "../../stores/gameStore";
import type { GameSettings } from "../../types/game";
import { GodModeDisabledGate, GodModePanel } from "./GodModePanel";

export function GodModePage() {
  const { t } = useI18n();
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
      setStatusMessage(t("status.godModeOn"));
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setEnabling(false);
    }
  };

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="app-page-header-main">
          <h2>{t("page.godMode.title")}</h2>
          <p className="muted">{t("page.godMode.subtitle")}</p>
        </div>
      </header>
      <div className="app-page-content god-mode-page-content">
        {settings.god_mode_enabled ? (
          <GodModePanel />
        ) : (
          <GodModeDisabledGate onEnable={() => void enableGodMode()} busy={enabling} />
        )}
      </div>
    </div>
  );
}