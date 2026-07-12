import { showFateUI, showSimulationChrome } from "../../config/features";
import { useI18n } from "../../i18n/I18nProvider";
import { useGameStore } from "../../stores/gameStore";
import { useProgressStore } from "../../stores/progressStore";

export function OfflineStatusBar() {
  const { t } = useI18n();
  const settings = useGameStore((state) => state.settings);
  const hubStatus = useGameStore((state) => state.hubStatus);
  const simTickLabel = useProgressStore((state) => state.simTickLabel);
  const simTickPercent = useProgressStore((state) => state.simTickPercent);
  const tickInFlight = useProgressStore((state) => state.tickInFlight);

  const cloudEnabled = !settings.pure_local_mode;
  const eventsLabel =
    settings.play_mode === "work"
      ? t("statusBar.workMode")
      : settings.random_events_enabled
        ? t("statusBar.gameFate", {
            pct: Math.round((settings.random_event_chance || 0.15) * 100),
          })
        : t("statusBar.gameFateIdle");

  return (
    <div className="offline-status-bar" aria-label={t("statusBar.aria")}>
      <span className={`offline-pill ${settings.pure_local_mode ? "pure-local" : "hybrid"}`}>
        {settings.pure_local_mode ? t("statusBar.pureLocal") : t("statusBar.hybrid")}
      </span>
      <span className={`offline-pill ${cloudEnabled && hubStatus.connected ? "online" : "offline"}`}>
        {cloudEnabled
          ? hubStatus.connected
            ? t("statusBar.hubConnected")
            : t("statusBar.hubOffline")
          : t("statusBar.cloudDisabled")}
      </span>
      {showFateUI ? <span className="offline-pill muted">{eventsLabel}</span> : null}
      {settings.low_power_mode ? (
        <span className="offline-pill performance">{t("statusBar.lowPower")}</span>
      ) : null}
      {settings.backup_interval_minutes > 0 ? (
        <span className="offline-pill backup">
          {t("statusBar.autoBackup", { mins: settings.backup_interval_minutes })}
        </span>
      ) : null}
      {showSimulationChrome && tickInFlight && simTickLabel ? (
        <span className="sim-tick-pill" aria-live="polite">
          {simTickLabel}
          {simTickPercent !== null ? ` ${Math.round(simTickPercent)}%` : ""}
        </span>
      ) : null}
    </div>
  );
}
